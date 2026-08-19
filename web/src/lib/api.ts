import type {
  DIDDocument,
  DIDResolutionResult,
  VerificationMethod,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface ResolveError {
  ok: false;
  error: string;
  did: string;
}

export interface ResolveOk {
  ok: true;
  did: string;
  method: string;
  resolution: DIDResolutionResult;
  doc: DIDDocument;
  view: ResultView;
}

export type ResolveOutcome = ResolveOk | ResolveError;

/** Normalized data the results UI renders (mirrors the design's `res`). */
export interface ResultView {
  did: string;
  method: string;
  methodTag: string;
  resolver: string;
  network: string;
  duration: string;
  route: "local" | "upstream";
  /** Probation double-check outcome, when the method is under verification. */
  verification?: {
    status: "match" | "mismatch" | "unverified";
    provider?: string;
  };
  controllerShort: string;
  created: string;
  updated: string;
  deactivated: string;
  vmCount: number;
  byteSize: string;
  vmList: VmCard[];
  relList: RelRow[];
  svcList: SvcRow[];
  healthRows: HealthRow[];
  json: string;
}

export interface VmCard {
  frag: string;
  type: string;
  keyLabel: string;
  keyValue: string;
  uses: string[];
  /** Structural chips for compound methods (VerifiableCondition):
   * `threshold 5`, `weights 2+2+2+2+2+1`, `6 conditions`, `parent #owner`. */
  badges: string[];
}
export interface RelRow {
  name: string;
  refs: string;
  accent: boolean;
}
export interface SvcRow {
  frag: string;
  type: string;
  endpoint: string;
  href: string | null;
}
export interface HealthRow {
  label: string;
  value: string;
  good?: boolean;
}

const REL_DEFS: { key: keyof DIDDocument; accent: boolean }[] = [
  { key: "authentication", accent: true },
  { key: "assertionMethod", accent: true },
  { key: "keyAgreement", accent: false },
  { key: "capabilityInvocation", accent: false },
  { key: "capabilityDelegation", accent: false },
];

const asArray = <T>(value: T | T[] | null | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

const refId = (x: unknown): string => {
  if (typeof x === "string") return x;
  if (!x || typeof x !== "object") return "";
  const record = x as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  const publicKey = asArray(record.publicKey).find(
    (value): value is string => typeof value === "string",
  );
  return publicKey ?? "";
};
const frag = (id: unknown): string => {
  const value = typeof id === "string" ? id : "";
  if (!value) return "—";
  const hash = value.indexOf("#");
  // Ids without a fragment (e.g. URL service ids) are shown as-is — a
  // prepended "#" would mislabel them as fragments.
  return hash >= 0 ? "#" + value.slice(hash + 1) : value;
};

/** Displayable key material of one verification-method-shaped object. */
function keyMaterialOf(
  vm: Record<string, unknown>,
): { label: string; value: string } | null {
  if (typeof vm.publicKeyMultibase === "string") {
    return { label: "publicKeyMultibase", value: vm.publicKeyMultibase };
  }
  const jwk = vm.publicKeyJwk as Record<string, unknown> | undefined;
  if (jwk && typeof jwk === "object") {
    // A kid is the friendliest form when present (EOSIO puts the canonical
    // PUB_K1_… key string there); otherwise curve · x.
    const kid = typeof jwk.kid === "string" ? jwk.kid : "";
    const value =
      kid ||
      `${String(jwk.crv ?? jwk.kty ?? "JWK")} · ${String(jwk.x ?? "")}`.trim();
    return { label: "publicKeyJwk", value };
  }
  if (typeof vm.blockchainAccountId === "string") {
    return { label: "blockchainAccountId", value: vm.blockchainAccountId };
  }
  if (typeof vm.publicKeyHex === "string") {
    return { label: "publicKeyHex", value: vm.publicKeyHex };
  }
  if (typeof vm.publicKey === "string") {
    return { label: "publicKey", value: vm.publicKey };
  }
  if (typeof vm.publicKeyBase58 === "string") {
    return { label: "publicKeyBase58", value: vm.publicKeyBase58 };
  }
  // Iden3 state methods (Iden3StateInfo2023) carry no key by design — they
  // anchor an identity state on chain; the contract address is the anchor.
  if (typeof vm.stateContractAddress === "string") {
    return { label: "stateContractAddress", value: vm.stateContractAddress };
  }
  return null;
}

/** Direct nested conditions of a VerifiableCondition-style method.
 * Weighted-threshold entries wrap the condition in `{ condition, weight }`. */
function conditionsOf(vm: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const field of [
    "conditionWeightedThreshold",
    "conditionThreshold",
    "conditionAnd",
    "conditionOr",
  ]) {
    for (const entry of asArray(vm[field] as unknown)) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const condition = (record.condition ?? record) as unknown;
      if (condition && typeof condition === "object") {
        out.push(condition as Record<string, unknown>);
      }
    }
  }
  return out;
}

/** Recursively gather the keys and delegations a compound method resolves to. */
function collectConditions(
  vm: Record<string, unknown>,
  depth = 0,
): { keys: { label: string; value: string }[]; delegates: string[] } {
  const keys: { label: string; value: string }[] = [];
  const delegates: string[] = [];
  if (typeof vm.conditionDelegated === "string") {
    delegates.push(vm.conditionDelegated);
  }
  if (depth >= 4) return { keys, delegates };
  for (const condition of conditionsOf(vm)) {
    const material = keyMaterialOf(condition);
    if (material) keys.push(material);
    const nested = collectConditions(condition, depth + 1);
    keys.push(...nested.keys);
    delegates.push(...nested.delegates);
  }
  return { keys, delegates };
}

function truncate(s: string, head = 22, tail = 14): string {
  if (!s) return s;
  if (s.length <= head + tail + 3) return s;
  return s.slice(0, head) + "…" + s.slice(-tail);
}

function endpointStr(e: SvcRow["endpoint"] | unknown): string {
  if (typeof e === "string") return e;
  if (Array.isArray(e)) return endpointStr(e[0]);
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    return String(o.uri ?? o.origins ?? JSON.stringify(e));
  }
  return String(e ?? "");
}

/** Only expose navigation for conventional web service endpoints from untrusted DID documents. */
export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Basic client-side DID syntax check (server validates authoritatively). */
export function validateDid(input: string): string | null {
  const q = input.trim();
  if (!q) return "Enter a DID to resolve — e.g. did:web:identity.foundation";
  if (q.slice(0, 4).toLowerCase() !== "did:" || q.split(":").length < 3) {
    return "That doesn’t look like a DID. Format: did:<method>:<id>";
  }
  return null;
}

export function buildView(
  did: string,
  resolution: DIDResolutionResult,
  doc: DIDDocument,
): ResultView {
  const method = did.split(":")[1]?.toLowerCase() ?? "";
  const meta = resolution.didResolutionMetadata;
  const dm = resolution.didDocumentMetadata ?? {};
  const rawDoc = doc as DIDDocument & Record<string, unknown>;
  const vms = asArray(
    doc.verificationMethod ??
      (rawDoc.publicKey as
        VerificationMethod | VerificationMethod[] | undefined),
  );

  const relationshipRefs = (key: keyof DIDDocument): string[] =>
    asArray(doc[key] as unknown).flatMap((entry) => {
      if (typeof entry === "string") return [entry];
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      const refs = [refId(record)];
      for (const field of ["publicKey", "verificationMethod"]) {
        refs.push(
          ...asArray(record[field]).filter(
            (value): value is string => typeof value === "string",
          ),
        );
      }
      return [...new Set(refs.filter(Boolean))];
    });

  const usesFor = (id: string): string[] =>
    REL_DEFS.filter((r) => relationshipRefs(r.key).includes(id)).map(
      (r) => r.key as string,
    );

  const vmList: VmCard[] = vms.map((vm) => {
    const record = vm as VerificationMethod & Record<string, unknown>;
    const material = keyMaterialOf(record);
    let keyLabel = material?.label ?? "Public key";
    let keyValue = material?.value ?? "";

    if (!material) {
      // Compound methods (VerifiableCondition) keep their material inside
      // nested conditions — surface the keys or the delegation targets.
      const { keys, delegates } = collectConditions(record);
      if (keys.length > 0) {
        keyLabel =
          keys.length === 1
            ? keys[0].label
            : `${keys[0].label} × ${keys.length}`;
        keyValue = keys.map((k) => k.value).join(", ");
      } else if (delegates.length > 0) {
        keyLabel =
          delegates.length === 1
            ? "Delegates to"
            : `Delegates to (${delegates.length})`;
        keyValue = delegates.join(", ");
      }
    }

    const badges: string[] = [];
    if (typeof record.threshold === "number") {
      badges.push(`threshold ${record.threshold}`);
    }
    const weights = asArray(record.conditionWeightedThreshold as unknown)
      .map((entry) =>
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>).weight
          : undefined,
      )
      .filter((w): w is number => typeof w === "number");
    if (weights.some((w) => w !== 1)) {
      badges.push(`weights ${weights.join("+")}`);
    }
    const conditionCount = conditionsOf(record).length;
    if (conditionCount > 1) badges.push(`${conditionCount} conditions`);
    for (const parent of asArray(record.relationshipParent as unknown)) {
      if (typeof parent === "string") badges.push(`parent ${frag(parent)}`);
    }
    // Iden3 state anchors: publication status + the current identity state.
    if (typeof record.published === "boolean") {
      badges.push(record.published ? "published" : "unpublished");
    }
    const stateInfo = record.info as Record<string, unknown> | undefined;
    if (
      stateInfo &&
      typeof stateInfo === "object" &&
      typeof stateInfo.state === "string" &&
      stateInfo.state
    ) {
      badges.push(`state ${truncate(stateInfo.state, 8, 6)}`);
    }
    // Honest label when the method carries nothing key-like at all.
    if (!keyValue) keyLabel = "Key material";

    return {
      frag: frag(vm.id),
      type: typeof vm.type === "string" ? vm.type : "VerificationMethod",
      keyLabel,
      keyValue,
      uses: usesFor(vm.id),
      badges,
    };
  });

  const relList: RelRow[] = REL_DEFS.map((r) => ({
    definition: r,
    refs: relationshipRefs(r.key),
  }))
    .filter(({ refs }) => refs.length > 0)
    .map(({ definition: r, refs }) => ({
      name: r.key as string,
      accent: r.accent,
      refs: refs.map(frag).join(", "),
    }));

  const svc = asArray(doc.service);
  const svcList: SvcRow[] = svc.map((s, index) => {
    const endpoint = endpointStr(s.serviceEndpoint);
    return {
      frag: s.id ? frag(s.id) : `#service-${index + 1}`,
      type: Array.isArray(s.type) ? s.type.join(", ") : (s.type ?? "Service"),
      endpoint,
      href: safeExternalUrl(endpoint),
    };
  });

  // Only a DECLARED controller is shown; an absent one means the subject
  // controls itself, which must not render as if the document declared it.
  const controller = Array.isArray(doc.controller)
    ? doc.controller[0]
    : doc.controller;
  const json = JSON.stringify(doc, null, 2);

  const healthRows: HealthRow[] = [
    { label: "Verification methods", value: String(vms.length) },
    { label: "Key relationships", value: String(relList.length) },
    { label: "Service endpoints", value: String(svc.length) },
    { label: "Resolution format", value: "DID Core shape", good: true },
  ];

  return {
    did,
    method,
    methodTag: "did:" + method,
    resolver: meta.resolver ?? `${method} driver`,
    network: meta.network ?? "Method-specific ledger",
    duration: (meta.durationMs ?? 0) + " ms",
    route: meta.route ?? "upstream",
    ...(meta.verification ? { verification: meta.verification } : {}),
    controllerShort: truncate(controller ?? "—"),
    created: dm.created ?? "—",
    updated: dm.updated ?? "—",
    deactivated: dm.deactivated ? "Yes" : "No",
    vmCount: vms.length,
    byteSize: new Blob([json]).size + " bytes",
    vmList,
    relList,
    svcList,
    healthRows,
    json,
  };
}

export async function resolveDid(
  input: string,
  signal?: AbortSignal,
): Promise<ResolveOutcome> {
  const did = input.trim();
  const res = await fetch(
    `${API_BASE}/1.0/identifiers/${encodeURIComponent(did)}`,
    {
      headers: {
        accept: 'application/ld+json;profile="https://w3id.org/did-resolution"',
      },
      signal,
    },
  );
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json"))
    throw new Error(`Unexpected response type (${res.status})`);
  const resolution = (await res.json()) as DIDResolutionResult;
  if (
    !resolution ||
    typeof resolution !== "object" ||
    !resolution.didResolutionMetadata
  ) {
    throw new Error("Invalid resolution response");
  }
  const rawError: unknown = resolution.didResolutionMetadata?.error;
  const err =
    typeof rawError === "string"
      ? rawError
      : rawError && typeof rawError === "object"
        ? "upstreamError"
        : undefined;
  if (err || !resolution.didDocument) {
    return { ok: false, did, error: err ?? "notFound" };
  }
  return {
    ok: true,
    did,
    method: did.split(":")[1]?.toLowerCase() ?? "",
    resolution,
    doc: resolution.didDocument,
    view: buildView(did, resolution, resolution.didDocument),
  };
}
