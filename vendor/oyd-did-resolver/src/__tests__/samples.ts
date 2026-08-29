/**
 * Golden vectors from the OYDID specification's own Samples section
 * (https://ownyourdata.github.io/oydid/#samples), captured live from the
 * reference deployment on 2026-08-28:
 *
 * - an UPDATED DID (CREATE → TERMINATE → REVOKE → UPDATE → TERMINATE),
 *   resolvable through both its original and its updated identifier,
 * - a REVOKED DID (the repository answers 410, and the full log allows
 *   independent revocation detection),
 * - a DID hosted at a NON-DEFAULT repository (did2.data-container.net).
 *
 * Note the repository behavior these captures document: `/doc/{id}` serves
 * the LATEST document even for an old version identifier, while
 * `/doc_raw/{hash}` is version-exact (its content hashes to the requested
 * identifier).
 */
import type { LogEntry } from "../basic.js";

/* ── updated DID (spec sample) ── */

export const UPDATED_OLD_HASH =
  "zQmdXNRiMWEYTiYF58a9BaiUkfB2xWUgL7G7ozyCCNPqjKV";
export const UPDATED_NEW_HASH =
  "zQmeArtmfxJ1JB6CXvoFdcQCyxPcYii5DUTBR44g4xYpCLR";
export const UPDATED_OLD_DID = "did:oyd:" + UPDATED_OLD_HASH;
export const UPDATED_NEW_DID = "did:oyd:" + UPDATED_NEW_HASH;

/** GET /doc_raw/{old} — the ORIGINAL version's record (hashes to the old id). */
export const UPDATED_OLD_RECORD = {
  doc: { content: "original" },
  key: "z6MuyXnvW3o9HVq3oD5FY9yzSEneiWe8YmoxzasGxmDbrP2x:z6MurxAg6d26HtToacPh5jDivb447qgYoTnzszwsRLRScp8H",
  log: "zQmPDhbTka18B4kBavd9FNqmZguH3E5WaF4E1APbuyn4c2n",
};

/** GET /doc_raw/{new} — the UPDATED record (hashes to the new id); also what
 *  GET /doc/{old} and /doc/{new} both serve (latest-document behavior). */
export const UPDATED_NEW_RECORD = {
  doc: { content: "updated" },
  key: "z6Mv4q7EFUKq7p8KKGGfh1UjduMrpNnzdprtaMiFsp9Kq9gD:z6MuxmEJYvuo7kre1hXcdVuTm7igpGxi7MkkgrtstRmGVyxY",
  log: "zQmTDrBYmvKTuo5KvW84uvRrGizrPNym1nF15fpBtiHLc6i",
};

/** GET /log/{old} and /log/{new} — the shared full provenance log. */
export const UPDATED_LOG: LogEntry[] = [
  {
    ts: 1641224940,
    op: 1,
    doc: "zQmX2w33VMQ7nanSD93weaxQAYbPL8LGYCTGdQpRJmYgggb",
    sig: "z5aX7xxhwtC5tBKRYZkpEgToyuyjgMkKVnHhk3LNqadQ7e2NHonpGxHa2a8PPysSkNKuPhQ6Wh9q2bcMMN2JcL8C4",
    previous: [
      "zQmZ7WA1Xydpneo3idsiUvHAaWEUDUUdXnpHVawueop3hZL",
      "zQmPDhbTka18B4kBavd9FNqmZguH3E5WaF4E1APbuyn4c2n",
    ],
  },
  {
    ts: 1641224940,
    op: 2,
    doc: "zQmdXNRiMWEYTiYF58a9BaiUkfB2xWUgL7G7ozyCCNPqjKV",
    sig: "z3gNUCFbgr2yAEq7Ze6HMmCaNbGfaqQRA9MWJf8W3JoqzZVSBQ4Z8bJnuUBepBbmNezodFQ9QQ9734Tn9LWSBMbr2",
    previous: [],
  },
  {
    ts: 1641224940,
    op: 0,
    doc: "zQmTuyvjHSeTASUJmdtGAr3i5yUjoHv2PVW2J2HTwiufJCr",
    sig: "zgXuJLZfCEsqArXdHURpjxaQCXLBLRbdC4sfcgvQhN2Cnrp4QFYEEiwk9qVgeumHSfdmxovhdbUYBNxUegapdwEL",
    previous: [],
  },
  {
    ts: 1641225032,
    op: 3,
    doc: "zQmeArtmfxJ1JB6CXvoFdcQCyxPcYii5DUTBR44g4xYpCLR",
    sig: "z44ZDR2MUGwoGzpDCz6tPMV3CgYER8Fw921A2JC2DLSHDnXpeembxfAPUXnXDQfbEJUGVpDfTGC7CPR8uCj9MAGw3",
    previous: ["zQmNvcDNfbPTEKf4WuvVfxtU1WJtgEa5wrDzzT8jQuvK27m"],
  },
  {
    ts: 1641225032,
    op: 0,
    doc: "zQmTxZVJv5TZwGH7cfV2z9Wv2nkF1VUBD8xDC9zgw77ew2N",
    sig: "zYr6trnYrmBFX5wXU6DUwjWRWLZRKtEssYFsQW1XDE3MVuMGzoDjp5ttxSawZe3mnRKoVZJdnJXgNi4K4sCL918Y",
    previous: [],
  },
];

const UPDATED_ORDERED_LOG = [
  UPDATED_LOG[1],
  UPDATED_LOG[2],
  UPDATED_LOG[0],
  UPDATED_LOG[3],
  UPDATED_LOG[4],
];

const updatedDocument = (id: string, other: string) => ({
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1",
  ],
  id,
  verificationMethod: [
    {
      id: id + "#key-doc",
      type: "Ed25519VerificationKey2020",
      controller: id,
      publicKeyMultibase: "z6Mv4q7EFUKq7p8KKGGfh1UjduMrpNnzdprtaMiFsp9Kq9gD",
    },
    {
      id: id + "#key-rev",
      type: "Ed25519VerificationKey2020",
      controller: id,
      publicKeyMultibase: "z6MuxmEJYvuo7kre1hXcdVuTm7igpGxi7MkkgrtstRmGVyxY",
    },
  ],
  alsoKnownAs: [other],
  service: [
    {
      id: id + "#payload",
      type: "Custom",
      serviceEndpoint: "https://oydid.ownyourdata.eu",
      payload: { content: "updated" },
    },
  ],
});

const updatedMetadata = (id: string, other: string) => ({
  keys: [
    {
      kid: id + "#key-doc",
      kms: "local",
      type: "Ed25519",
      publicKeyHex:
        "ed20b625defd50d9ba296f742890b391fa9ace42d22c7df4e3fa9883ee5bc7fb6462",
    },
    {
      kid: id + "#key-rev",
      kms: "local",
      type: "Ed25519",
      publicKeyHex:
        "ed205c016cced936a41880d6522bcb349296f4e4ad6fd81e926c14d46a7062d0fdc5",
    },
  ],
  registry: "https://oydid.ownyourdata.eu",
  log_hash: "zQmTDrBYmvKTuo5KvW84uvRrGizrPNym1nF15fpBtiHLc6i",
  log: UPDATED_ORDERED_LOG,
  document_log_id: 3,
  termination_log_id: 4,
  canonicalId: UPDATED_NEW_DID,
  equivalentId: [other],
  versionId: UPDATED_NEW_HASH,
  created: "2022-01-03T15:49:00Z",
  updated: "2022-01-03T15:50:32Z",
});

/** resolver.ownyourdata.eu output for the OLD identifier. */
export const REFERENCE_UPDATED_OLD = {
  didDocument: updatedDocument(UPDATED_OLD_DID, UPDATED_NEW_DID),
  didDocumentMetadata: updatedMetadata(UPDATED_OLD_DID, UPDATED_NEW_DID),
};

/** resolver.ownyourdata.eu output for the NEW identifier. */
export const REFERENCE_UPDATED_NEW = {
  didDocument: updatedDocument(UPDATED_NEW_DID, UPDATED_OLD_DID),
  didDocumentMetadata: updatedMetadata(UPDATED_NEW_DID, UPDATED_OLD_DID),
};

/* ── revoked DID (spec sample) ── */

export const REVOKED_HASH = "zQmQMvhHrccgcP2XzE2rM4E8MDx9P8D5FWPdDF1DTPikF4F";
export const REVOKED_DID = "did:oyd:" + REVOKED_HASH;

/** GET /doc_raw/{revoked}.doc — the version record (repository /doc answers
 *  410 for it, but the record itself is still verifiable). */
export const REVOKED_RECORD = {
  doc: { example: "deactivated" },
  key: "z6Mv8nknUPUSC7pwWqRpN7AsQUc8FRF8eURgQRMxQ1Y1G1iv:z6Mv29cPssXiMxozqbW82hk4Q8F5uLbH3EuE2j1t3jHri77e",
  log: "zQmc9DQpkP3oZs4mTPxKvbFDLiuzBXdAr6aYjgx4MJwnXkV",
};

/** GET /log/{revoked} — CREATE, published REVOKE, TERMINATE. */
export const REVOKED_LOG: LogEntry[] = [
  {
    ts: 1641230231,
    op: 2,
    doc: "zQmQMvhHrccgcP2XzE2rM4E8MDx9P8D5FWPdDF1DTPikF4F",
    sig: "z5upKhjn9HDUUehmBvPrBi3YQrqmTLPRiBimRYJTNm34iU8RsB4Dx4iLbznxiGoPin8S6mbWWTANSo8AoXXv5F9Hr",
    previous: [],
  },
  {
    ts: 1641230231,
    op: 1,
    doc: "zQmeiwTma5f8p7WdcKhHksTuyPpk2w4YzWTQhn64nUNxpbX",
    sig: "z5cS3QGFVKuko3jyujguSGhuj926hs8JQ7CWFxov1SeRuADpWarP9PJCQXqKzCaXwHYfPqnFe5zjkkUVWAx77ez4o",
    previous: [
      "zQmXZbS6aBtdd29yPYwV4KKkRMqUDT6SD6m2JtsFxLVZvAi",
      "zQmc9DQpkP3oZs4mTPxKvbFDLiuzBXdAr6aYjgx4MJwnXkV",
    ],
  },
  {
    ts: 1641230231,
    op: 0,
    doc: "zQmbVMBhYwuHwtTrPWTgQpMkW2ddSfMVcKUaHRyAfb51Vym",
    sig: "z4Yno7vDT91rG1efeBJH2hPjFQPbpA7QDT7Z343eG2rewMymYjdK5s8ZmUbxwSqsGsKVZnazPeScC8Tzi3iRkE5Vm",
    previous: [],
  },
];

/* ── non-default-location DID (spec sample, did2.data-container.net) ── */

export const LOCATION_HASH = "zQmNauTUUdkpi5TcrTZ2524SKM8dJAzuuw4xfW13iHrtY1W";
export const LOCATION_DID =
  "did:oyd:" + LOCATION_HASH + "%40did2.data-container.net";
export const LOCATION_HOST = "did2.data-container.net";

export const LOCATION_RECORD = {
  doc: { location: "non-default" },
  key: "z6MutdYiDqv5kiJ79KXhcSyD38RZTRRhHYkhBo16891QsVmV:z6Mv8NqXsiUXeHVgJGCeX3JSnGwD17JKxMHep47SfSEy4u8Y",
  log: "zQmQwzGTZk1Me6GKWe6egJXGtRmoR3dfymVci4yqePqS8SN@https://did2.data-container.net",
};

export const LOCATION_LOG: LogEntry[] = [
  {
    ts: 1641225335,
    op: 2,
    doc: "zQmNauTUUdkpi5TcrTZ2524SKM8dJAzuuw4xfW13iHrtY1W@https://did2.data-container.net",
    sig: "zMNwLhMDERej1T3m7WorffkaVhv92Hdv1ximQB9qqVtRU5CzLsrtSgV18fwtDKHDwooEm7AWDq9RdQNC6xKXSJV2",
    previous: [],
  },
  {
    ts: 1641225335,
    op: 0,
    doc: "zQmbTz2DnhrqUVpEoDer1nrD3UWe93Sdd4Vc7hW3JYoWULN@https://did2.data-container.net",
    sig: "z5hSzwQDUi6SouR98kz1o5hTxeWiJXq6qiTDB47iZLYyWqj4DjoNTT43u4kaDsTtWqgsUL6dVXYyLoKJFPEeGAzB4",
    previous: [],
  },
];

const LOCATION_ID_ENCODED =
  "did:oyd:" + LOCATION_HASH + "%40did2.data-container.net";

/** resolver.ownyourdata.eu output for the %40-form identifier. */
export const REFERENCE_LOCATION_DOCUMENT = {
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1",
  ],
  id: LOCATION_ID_ENCODED,
  verificationMethod: [
    {
      id: LOCATION_ID_ENCODED + "#key-doc",
      type: "Ed25519VerificationKey2020",
      controller: LOCATION_ID_ENCODED,
      publicKeyMultibase: "z6MutdYiDqv5kiJ79KXhcSyD38RZTRRhHYkhBo16891QsVmV",
    },
    {
      id: LOCATION_ID_ENCODED + "#key-rev",
      type: "Ed25519VerificationKey2020",
      controller: LOCATION_ID_ENCODED,
      publicKeyMultibase: "z6Mv8NqXsiUXeHVgJGCeX3JSnGwD17JKxMHep47SfSEy4u8Y",
    },
  ],
  service: [
    {
      id: LOCATION_ID_ENCODED + "#payload",
      type: "Custom",
      serviceEndpoint: "https://did2.data-container.net",
      payload: { location: "non-default" },
    },
  ],
};

/* ── fetch router over all samples ── */

/** Serves every sample from a stubbed fetch, mirroring the observed
 *  repository behavior (latest document under /doc, version-exact /doc_raw,
 *  410 for the revoked DID's /doc unless `revokedMode: "served"`). */
export function samplesFetch(
  revokedMode: "gone" | "served" = "gone",
): (input: RequestInfo | URL) => Promise<Response> {
  return async (input) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const json = (value: unknown) => Promise.resolve(Response.json(value));

    if (url.hostname === LOCATION_HOST) {
      if (path === "/doc/" + LOCATION_HASH) return json(LOCATION_RECORD);
      if (path === "/doc_raw/" + LOCATION_HASH) {
        return json({ doc: LOCATION_RECORD, log: LOCATION_LOG });
      }
      if (path === "/log/" + LOCATION_HASH) return json(LOCATION_LOG);
    }

    if (
      path === "/doc/" + UPDATED_OLD_HASH ||
      path === "/doc/" + UPDATED_NEW_HASH
    ) {
      return json(UPDATED_NEW_RECORD); // the repository serves the latest
    }
    if (path === "/doc_raw/" + UPDATED_OLD_HASH) {
      return json({ doc: UPDATED_OLD_RECORD, log: UPDATED_LOG });
    }
    if (path === "/doc_raw/" + UPDATED_NEW_HASH) {
      return json({ doc: UPDATED_NEW_RECORD, log: UPDATED_LOG });
    }
    if (
      path === "/log/" + UPDATED_OLD_HASH ||
      path === "/log/" + UPDATED_NEW_HASH
    ) {
      return json(UPDATED_LOG);
    }

    if (path === "/doc/" + REVOKED_HASH) {
      return revokedMode === "gone"
        ? Promise.resolve(Response.json({ error: "revoked" }, { status: 410 }))
        : json(REVOKED_RECORD);
    }
    if (path === "/doc_raw/" + REVOKED_HASH) {
      return json({ doc: REVOKED_RECORD, log: REVOKED_LOG });
    }
    if (path === "/log/" + REVOKED_HASH) return json(REVOKED_LOG);

    return Promise.resolve(
      Response.json({ error: "not found" }, { status: 404 }),
    );
  };
}
