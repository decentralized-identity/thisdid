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
  return value ? "#" + (value.split("#")[1] ?? value) : "—";
};

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
    let keyValue = "";
    let keyLabel = "Public key";
    const legacyVm = vm as VerificationMethod & Record<string, unknown>;
    if (vm.publicKeyMultibase) {
      keyValue = vm.publicKeyMultibase;
      keyLabel = "publicKeyMultibase";
    } else if (vm.publicKeyJwk) {
      keyValue =
        `${vm.publicKeyJwk.crv ?? vm.publicKeyJwk.kty ?? "JWK"} · ${vm.publicKeyJwk.x ?? ""}`.trim();
      keyLabel = "publicKeyJwk";
    } else if (vm.blockchainAccountId) {
      keyValue = vm.blockchainAccountId;
      keyLabel = "blockchainAccountId";
    } else if (typeof legacyVm.publicKeyHex === "string") {
      keyValue = legacyVm.publicKeyHex;
      keyLabel = "publicKeyHex";
    } else if (typeof legacyVm.publicKey === "string") {
      keyValue = legacyVm.publicKey;
      keyLabel = "publicKey";
    }
    return {
      frag: frag(vm.id),
      type: typeof vm.type === "string" ? vm.type : "VerificationMethod",
      keyLabel,
      keyValue,
      uses: usesFor(vm.id),
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

  const controller = Array.isArray(doc.controller)
    ? doc.controller[0]
    : (doc.controller ?? doc.id);
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
