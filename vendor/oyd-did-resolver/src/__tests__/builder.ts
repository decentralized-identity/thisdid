/**
 * Adversarial-test toolkit: mints OYDID DIDs with real Ed25519 keys and real
 * signatures following the reference write path, so the security tests can
 * then splice, disconnect, or forge parts of a genuine chain. Not shipped
 * (lives under __tests__).
 */
import {
  canonical,
  isPubKeyIdentifier,
  multiEncode,
  multiHash,
  LOG_HASH_OPTIONS,
  type LogEntry,
} from "../basic.js";
import { Op } from "../log.js";

function must<T>([value, message]: [T | null, string]): T {
  if (value === null) throw new Error(message || "no value");
  return value;
}

export async function keypair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
}

export async function packKey(pair: CryptoKeyPair): Promise<string> {
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  return must(multiEncode(new Uint8Array([0xed, 0x20, ...raw]), {}));
}

export async function sign(
  pair: CryptoKeyPair,
  message: string,
): Promise<string> {
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "Ed25519",
      pair.privateKey,
      new TextEncoder().encode(message),
    ),
  );
  return must(multiEncode(sig, {}));
}

export async function hashOf(value: unknown): Promise<string> {
  return must(await multiHash(canonical(value), LOG_HASH_OPTIONS));
}

export interface DocRecordShape {
  doc: unknown;
  key: string;
  log: string;
}

export interface MintedDid {
  did: string;
  didHash: string;
  fetch: (input: RequestInfo | URL) => Promise<Response>;
}

/** A repository fetch stub: `/doc_raw/{h}` is version-exact, `/doc/{h}`
 *  serves the latest document (the observed repository behavior), `/log/{h}`
 *  serves the full log. `logOverride(callIndex)` can vary the /log response
 *  per call (used to fail the revocation-branch lookup only). */
function repoFetch(
  records: Map<string, { doc: DocRecordShape; log: LogEntry[] }>,
  latest: DocRecordShape,
  fullLog: LogEntry[],
  logOverride?: (callIndex: number) => Response | null,
): (input: RequestInfo | URL) => Promise<Response> {
  let logCalls = 0;
  return async (input) => {
    const url = new URL(String(input));
    const path = url.pathname;
    for (const [h, rec] of records) {
      if (path === "/doc_raw/" + h) return Response.json(rec);
    }
    if (path.startsWith("/doc/")) return Response.json(latest);
    if (path.startsWith("/log/")) {
      const override = logOverride?.(logCalls++);
      if (override) return override;
      return Response.json(fullLog);
    }
    return Response.json({ error: "not found" }, { status: 404 });
  };
}

/** CREATE + TERMINATE, never revoked — the shape of the single-version
 *  canary, minted with fresh keys and an arbitrary payload. */
export async function mintSingleVersion(
  payload: unknown,
  logOverride?: (callIndex: number) => Response | null,
  opts: { badRevKey?: boolean; ts?: number } = {},
): Promise<MintedDid> {
  const docPair = await keypair();
  const revPair = await keypair();
  const docKey = await packKey(docPair);
  // a structurally invalid revocation key still commits (the identifier
  // hashes the whole record), exercising the resolver's key validation
  const revKey = opts.badRevKey ? "zNotAValidKey" : await packKey(revPair);
  const ts = opts.ts ?? 1700000000;

  // spec-correct REVOKE commitment (§4.1 op=1): doc = hash({doc, key});
  // unpublished here, so the sig placeholder is irrelevant
  const keyString = docKey + ":" + revKey;
  const revokeCore = {
    ts,
    op: Op.REVOKE,
    doc: await hashOf({ doc: payload, key: keyString }),
    sig: "zdummy",
  };
  const terminate: LogEntry = {
    ts,
    op: Op.TERMINATE,
    doc: await hashOf(revokeCore),
    sig: "",
    previous: [],
  };
  terminate.sig = await sign(docPair, terminate.doc);
  const record: DocRecordShape = {
    doc: payload,
    key: keyString,
    log: await hashOf(terminate),
  };
  const didHash = await hashOf(record);
  const create: LogEntry = {
    ts,
    op: Op.CREATE,
    doc: didHash,
    sig: await sign(docPair, didHash),
    previous: [],
  };
  const log = [create, terminate];
  const records = new Map([[didHash, { doc: record, log }]]);
  return {
    did: "did:oyd:" + didHash,
    didHash,
    fetch: repoFetch(records, record, log, logOverride),
  };
}

/**
 * A single-version DID addressed by its OWN document key — the correct,
 * binding pubkey-form identifier (spec §3.2.4: a pubkey-form id must equal a
 * document key of the DID). `did` resolves; `unboundDid` is a well-formed
 * pubkey-form identifier served by the SAME repository whose key is NOT a
 * document key — the exact shape of the real `z6MkrJVn…` artifact that only
 * repository trust resolves (see OYD-DID-CORPUS.md). The offline analog of that
 * live case, so the binding is covered without the network.
 */
export async function mintPubkeyForm(
  payload: unknown | ((did: string, docKey: string, revKey: string) => unknown),
): Promise<{
  did: string;
  docKey: string;
  revDid: string;
  unboundDid: string;
  fetch: MintedDid["fetch"];
}> {
  // packKey frames `0xed 0x20`; base58btc of that is z6M-prefixed, and
  // isPubKeyIdentifier additionally requires exactly 48 chars — retry the
  // occasional shorter encoding so the identifier is genuinely pubkey-form.
  const asPubkeyForm = async (): Promise<[CryptoKeyPair, string]> => {
    for (;;) {
      const pair = await keypair();
      const key = await packKey(pair);
      if (isPubKeyIdentifier(key)) return [pair, key];
    }
  };
  const [docPair, docKey] = await asPubkeyForm();
  // the revocation key is also minted as a valid pubkey-form identifier, so a
  // rev-key-addressed resolve fails the §3.2.4 binding (rev keys are not an
  // identifier form) rather than the generic non-pubkey-shape path
  const [, revKey] = await asPubkeyForm();
  const [, unboundKey] = await asPubkeyForm();
  const ts = 1700000000;
  const resolvedPayload =
    typeof payload === "function"
      ? (payload as (did: string, docKey: string, revKey: string) => unknown)(
          "did:oyd:" + docKey,
          docKey,
          revKey,
        )
      : payload;

  // spec-correct REVOKE commitment: doc = hash of the version's {doc, key}
  // (§4.1 op=1); unpublished here (the log carries CREATE+TERMINATE only)
  const keyString = docKey + ":" + revKey;
  const revokeCore = {
    ts,
    op: Op.REVOKE,
    doc: await hashOf({ doc: resolvedPayload, key: keyString }),
    sig: "zdummy",
  };
  const terminate: LogEntry = {
    ts,
    op: Op.TERMINATE,
    doc: await hashOf(revokeCore),
    sig: "",
    previous: [],
  };
  terminate.sig = await sign(docPair, terminate.doc);
  const record: DocRecordShape = {
    doc: resolvedPayload,
    key: keyString,
    log: await hashOf(terminate),
  };
  const didHash = await hashOf(record);
  const create: LogEntry = {
    ts,
    op: Op.CREATE,
    doc: didHash,
    sig: await sign(docPair, didHash),
    previous: [],
  };
  const log = [create, terminate];
  const records = new Map([[didHash, { doc: record, log }]]);
  return {
    did: "did:oyd:" + docKey,
    docKey,
    revDid: "did:oyd:" + revKey,
    unboundDid: "did:oyd:" + unboundKey,
    fetch: repoFetch(records, record, log),
  };
}

/** CREATE + TERMINATE + published REVOKE, no surviving UPDATE — revoked.
 *  `badRevSig` embeds a well-formed signature by the DOCUMENT key (the wrong
 *  key) in the committed REVOKE — a creator who holds only the doc key
 *  precommitting a revocation the revocation key never authorized. Default
 *  resolution REJECTS it (D2 ruling — verification is mandatory);
 *  `strictRevocationSig: false` restores legacy pre-0.9.4 parity, which
 *  honors it. `wrongRevDoc` keeps a valid rev-key signature but commits to
 *  other content — the D3 doc-commitment check's target, same defaults. */
export async function mintRevoked(
  payload: unknown,
  opts: { badRevSig?: boolean; wrongRevDoc?: boolean } = {},
): Promise<MintedDid> {
  const docPair = await keypair();
  const revPair = await keypair();
  const docKey = await packKey(docPair);
  const revKey = await packKey(revPair);
  const ts = 1700000000;

  // spec-correct REVOKE commitment (§4.1 op=1): doc = hash of the revoked
  // version's {doc, key}. `wrongRevDoc` keeps a VALID rev-key signature but
  // commits to other content — the (default-on) D3 doc-commitment check's
  // target.
  const keyString = docKey + ":" + revKey;
  const revokeDoc = opts.wrongRevDoc
    ? await hashOf({ doc: { other: "content" }, key: keyString })
    : await hashOf({ doc: payload, key: keyString });
  const revokeCore = {
    ts,
    op: Op.REVOKE,
    doc: revokeDoc,
    sig: opts.badRevSig
      ? await sign(docPair, revokeDoc)
      : await sign(revPair, revokeDoc),
  };
  const terminate: LogEntry = {
    ts,
    op: Op.TERMINATE,
    doc: await hashOf(revokeCore),
    sig: "",
    previous: [],
  };
  const record: DocRecordShape = {
    doc: payload,
    key: keyString,
    log: "",
  };
  terminate.sig = await sign(docPair, terminate.doc);
  record.log = await hashOf(terminate);
  const didHash = await hashOf(record);
  const create: LogEntry = {
    ts,
    op: Op.CREATE,
    doc: didHash,
    sig: await sign(docPair, didHash),
    previous: [],
  };
  const revoke: LogEntry = {
    ...revokeCore,
    previous: [await hashOf(create), await hashOf(terminate)],
  };
  const log = [create, terminate, revoke];
  const records = new Map([[didHash, { doc: record, log }]]);
  return {
    did: "did:oyd:" + didHash,
    didHash,
    fetch: repoFetch(records, record, log),
  };
}

/** CREATE(v1) → TERMINATE(v1) → REVOKE → UPDATE(v2) → TERMINATE(v2): the
 *  full update lifecycle. `updateSigner` chooses who signs the UPDATE, and
 *  an optional DELEGATE entry can be included connected or disconnected. */
export async function mintUpdateChain(opts: {
  updateSigner: "v1doc" | "delegate" | "v2doc";
  includeDelegate?: boolean;
  delegateConnected?: boolean;
  /** Append a SECOND validly-signed UPDATE referencing the same revocation —
   *  a genuine fork: two valid survivors (D4's ambiguous case). */
  duplicateSuccessor?: boolean;
}): Promise<{ didV1: string; didV2: string; fetch: MintedDid["fetch"] }> {
  const v1doc = await keypair();
  const v1rev = await keypair();
  const v2doc = await keypair();
  const v2rev = await keypair();
  const delegate = await keypair();
  const v1docKey = await packKey(v1doc);
  const v1revKey = await packKey(v1rev);
  const v2docKey = await packKey(v2doc);
  const v2revKey = await packKey(v2rev);
  const delegateKey = await packKey(delegate);
  const ts = 1700000000;

  // v1: CREATE + TERMINATE committing to a published REVOKE. The REVOKE
  // commits to v1's {doc, key} per spec §4.1 (op=1), so strict mode's
  // doc-commitment check passes on this genuine chain.
  const v1payload = { content: "original" };
  const v1keys = v1docKey + ":" + v1revKey;
  const revoke1Doc = await hashOf({ doc: v1payload, key: v1keys });
  const revoke1Core = {
    ts,
    op: Op.REVOKE,
    doc: revoke1Doc,
    sig: await sign(v1rev, revoke1Doc),
  };
  const terminate1: LogEntry = {
    ts,
    op: Op.TERMINATE,
    doc: await hashOf(revoke1Core),
    sig: "",
    previous: [],
  };
  const record1: DocRecordShape = {
    doc: v1payload,
    key: v1keys,
    log: "",
  };
  terminate1.sig = await sign(v1doc, terminate1.doc);
  record1.log = await hashOf(terminate1);
  const didV1 = await hashOf(record1);
  const create1: LogEntry = {
    ts,
    op: Op.CREATE,
    doc: didV1,
    sig: await sign(v1doc, didV1),
    previous: [],
  };
  const revoke1: LogEntry = {
    ...revoke1Core,
    previous: [await hashOf(create1), await hashOf(terminate1)],
  };

  // optional DELEGATE entry (connected = referenced by terminate2.previous)
  const delegateEntry: LogEntry = {
    ts,
    op: Op.DELEGATE,
    doc: "doc:" + delegateKey,
    sig: "zdummyDelegate",
    previous: [await hashOf(terminate1)],
  };

  // v2: TERMINATE committing to an UNpublished revoke (so v2 is live)
  const revoke2Core = { ts, op: Op.REVOKE, doc: "revoke2", sig: "zdummy2" };
  const terminate2: LogEntry = {
    ts,
    op: Op.TERMINATE,
    doc: await hashOf(revoke2Core),
    sig: "",
    previous:
      opts.includeDelegate && opts.delegateConnected
        ? [await hashOf(delegateEntry)]
        : [],
  };
  const record2: DocRecordShape = {
    doc: { content: "updated" },
    key: v2docKey + ":" + v2revKey,
    log: "",
  };
  terminate2.sig = await sign(v2doc, terminate2.doc);
  record2.log = await hashOf(terminate2);
  const didV2 = await hashOf(record2);

  const signerPair =
    opts.updateSigner === "v1doc"
      ? v1doc
      : opts.updateSigner === "delegate"
        ? delegate
        : v2doc;
  const update: LogEntry = {
    ts,
    op: Op.UPDATE,
    doc: didV2,
    sig: await sign(signerPair, didV2),
    previous: [await hashOf(revoke1)],
  };
  // second valid successor (distinct ts → distinct hash, same valid signer)
  const duplicate: LogEntry = {
    ts: ts + 1,
    op: Op.UPDATE,
    doc: didV2,
    sig: await sign(signerPair, didV2),
    previous: [await hashOf(revoke1)],
  };

  const log: LogEntry[] = [
    create1,
    terminate1,
    revoke1,
    update,
    ...(opts.duplicateSuccessor ? [duplicate] : []),
    terminate2,
    ...(opts.includeDelegate ? [delegateEntry] : []),
  ];
  const records = new Map([
    [didV1, { doc: record1, log }],
    [didV2, { doc: record2, log }],
  ]);
  return {
    didV1: "did:oyd:" + didV1,
    didV2: "did:oyd:" + didV2,
    fetch: repoFetch(records, record2, log),
  };
}

/** A DID whose log carries a TERMINATE belonging to a DIFFERENT DID (a
 *  foreign / disconnected TERMINATE): CREATE(A) + TERMINATE(B). */
export async function mintForeignTerminate(): Promise<MintedDid> {
  const aDoc = await keypair();
  const aRev = await keypair();
  const bDoc = await keypair();
  const bRev = await keypair();
  const aDocKey = await packKey(aDoc);
  const aRevKey = await packKey(aRev);
  const bDocKey = await packKey(bDoc);
  const bRevKey = await packKey(bRev);
  const ts = 1700000000;

  // B's TERMINATE (signed by B's key, committing to B's revoke)
  const bRevokeCore = { ts, op: Op.REVOKE, doc: "revokeB", sig: "zb" };
  const terminateB: LogEntry = {
    ts,
    op: Op.TERMINATE,
    doc: await hashOf(bRevokeCore),
    sig: "",
    previous: [],
  };
  terminateB.sig = await sign(bDoc, terminateB.doc);
  void bDocKey;
  void bRevKey;

  // A's record commits to A's OWN terminate, but the served log carries B's
  const aRevokeCore = { ts, op: Op.REVOKE, doc: "revokeA", sig: "za" };
  const terminateA: LogEntry = {
    ts,
    op: Op.TERMINATE,
    doc: await hashOf(aRevokeCore),
    sig: "",
    previous: [],
  };
  const recordA: DocRecordShape = {
    doc: { holder: "A" },
    key: aDocKey + ":" + aRevKey,
    log: "",
  };
  terminateA.sig = await sign(aDoc, terminateA.doc);
  recordA.log = await hashOf(terminateA);
  const didA = await hashOf(recordA);
  const createA: LogEntry = {
    ts,
    op: Op.CREATE,
    doc: didA,
    sig: await sign(aDoc, didA),
    previous: [],
  };

  // the malicious log: A's CREATE with B's TERMINATE spliced in
  const log = [createA, terminateB];
  const records = new Map([[didA, { doc: recordA, log }]]);
  return {
    did: "did:oyd:" + didA,
    didHash: didA,
    fetch: repoFetch(records, recordA, log),
  };
}

/** CREATE(v1) + UPDATE(v2) spliced directly onto CREATE (no revocation
 *  authorizing it) + TERMINATE(v2). */
export async function mintSplicedUpdate(): Promise<{
  didV1: string;
  fetch: MintedDid["fetch"];
}> {
  const v1doc = await keypair();
  const v1rev = await keypair();
  const v2doc = await keypair();
  const v2rev = await keypair();
  const v1docKey = await packKey(v1doc);
  const v1revKey = await packKey(v1rev);
  const v2docKey = await packKey(v2doc);
  const v2revKey = await packKey(v2rev);
  const ts = 1700000000;

  const revoke1Core = { ts, op: Op.REVOKE, doc: "revoke1", sig: "zd1" };
  const terminate1: LogEntry = {
    ts,
    op: Op.TERMINATE,
    doc: await hashOf(revoke1Core),
    sig: "",
    previous: [],
  };
  const record1: DocRecordShape = {
    doc: { content: "original" },
    key: v1docKey + ":" + v1revKey,
    log: "",
  };
  terminate1.sig = await sign(v1doc, terminate1.doc);
  record1.log = await hashOf(terminate1);
  const didV1 = await hashOf(record1);
  const create1: LogEntry = {
    ts,
    op: Op.CREATE,
    doc: didV1,
    sig: await sign(v1doc, didV1),
    previous: [],
  };

  const revoke2Core = { ts, op: Op.REVOKE, doc: "revoke2", sig: "zd2" };
  const terminate2: LogEntry = {
    ts,
    op: Op.TERMINATE,
    doc: await hashOf(revoke2Core),
    sig: "",
    previous: [],
  };
  const record2: DocRecordShape = {
    doc: { content: "spliced" },
    key: v2docKey + ":" + v2revKey,
    log: "",
  };
  const didV2Placeholder = { ...record2 };
  // build update pointing directly at CREATE, signed by attacker's v2 key
  const update: LogEntry = {
    ts,
    op: Op.UPDATE,
    doc: "",
    sig: "",
    previous: [await hashOf(create1)],
  };
  terminate2.sig = await sign(v2doc, terminate2.doc);
  record2.log = await hashOf(terminate2);
  const didV2 = await hashOf(record2);
  void didV2Placeholder;
  update.doc = didV2;
  update.sig = await sign(v2doc, didV2);
  terminate2.previous = [await hashOf(update)];

  const log = [create1, update, terminate2];
  const records = new Map([
    [didV1, { doc: record1, log }],
    [didV2, { doc: record2, log }],
  ]);
  return {
    didV1: "did:oyd:" + didV1,
    fetch: repoFetch(records, record2, log),
  };
}
