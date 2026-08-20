import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha256";
import { getResolver } from "../resolver.js";
import {
  LONG_FORM_DID,
  LONG_FORM_EXPECTED,
  SHORT_FORM_DID,
  SHORT_FORM_UPSTREAM,
} from "./fixture.js";

const ENDPOINT = "https://ion.test/1.0";

const resolve = (did: string, options: Record<string, unknown> = {}) =>
  getResolver({ endpointUrl: ENDPOINT }).ion(
    did,
    null as never,
    null as never,
    options as never,
  );

afterEach(() => vi.unstubAllGlobals());

// ── Synthetic long-form builder (same primitives, our own content) ─────────

const jcs = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
  const r = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(r)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + jcs(r[k]))
      .join(",") +
    "}"
  );
};
const b64u = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64url");
const multihash = (canonical: string): string =>
  b64u(
    new Uint8Array([
      0x12,
      0x20,
      ...sha256(new TextEncoder().encode(canonical)),
    ]),
  );

const JWK = {
  kty: "EC",
  crv: "secp256k1",
  x: "YsCgRtrM6G3dA0PG08fHnCIIug2cnPJKbQRtIdIfkPc",
  y: "bYP2pv8t-GZOx7gEqxNizJVAPkN00YGeCEC9iogXgA0",
};

function longFormFor(delta: Record<string, unknown>): string {
  const suffixData = {
    deltaHash: multihash(jcs(delta)),
    recoveryCommitment: multihash(jcs({ seed: "recover" })),
  };
  const suffix = multihash(jcs(suffixData));
  return `did:ion:${suffix}:${b64u(new TextEncoder().encode(jcs({ suffixData, delta })))}`;
}

const REPLACE_DELTA = {
  patches: [
    {
      action: "replace",
      document: {
        publicKeys: [
          {
            id: "sig",
            type: "EcdsaSecp256k1VerificationKey2019",
            publicKeyJwk: JWK,
            purposes: ["authentication"],
          },
          {
            id: "extra",
            type: "EcdsaSecp256k1VerificationKey2019",
            publicKeyJwk: JWK,
            purposes: ["assertionMethod"],
          },
        ],
        services: [
          {
            id: "site",
            type: "LinkedDomains",
            serviceEndpoint: "https://x.test",
          },
        ],
      },
    },
    { action: "remove-public-keys", ids: ["extra"] },
    {
      action: "add-services",
      services: [
        {
          id: "hub",
          type: "IdentityHub",
          serviceEndpoint: { uri: "https://h.test" },
        },
      ],
    },
  ],
  updateCommitment: multihash(jcs({ seed: "update" })),
};

// ── Long-form: offline, verified ────────────────────────────────────────────

describe("did:ion long-form (offline, verified)", () => {
  it("reproduces the reference resolver's document for the captured vector", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolve(LONG_FORM_DID);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument).toEqual(LONG_FORM_EXPECTED.didDocument);
    expect(result.didDocumentMetadata).toEqual(
      LONG_FORM_EXPECTED.didDocumentMetadata,
    );
  });

  it("applies add/remove patches in order", async () => {
    const did = longFormFor(REPLACE_DELTA);
    const result = await resolve(did);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument;
    expect(doc?.verificationMethod?.map((vm) => vm.id)).toEqual(["#sig"]);
    expect(doc?.authentication).toEqual(["#sig"]);
    expect(doc?.service?.map((s) => s.id)).toEqual(["#site", "#hub"]);
    expect(result.didDocumentMetadata.equivalentId).toEqual([
      `did:ion:${did.split(":")[2]}`,
    ]);
  });

  it("rejects a suffix that does not commit to the initial state", async () => {
    const [, , , state] = longFormFor(REPLACE_DELTA).split(":");
    const other = longFormFor({
      ...REPLACE_DELTA,
      updateCommitment: multihash("x"),
    });
    const [, , wrongSuffix] = other.split(":");
    const result = await resolve(`did:ion:${wrongSuffix}:${state}`);
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
    expect(result.didResolutionMetadata.message).toContain("suffix");
  });

  it("rejects a delta that breaks its deltaHash commitment", async () => {
    const delta = { ...REPLACE_DELTA };
    const suffixData = {
      deltaHash: multihash(jcs({ not: "the delta" })),
      recoveryCommitment: multihash(jcs({ seed: "r" })),
    };
    const suffix = multihash(jcs(suffixData));
    const did = `did:ion:${suffix}:${b64u(
      new TextEncoder().encode(jcs({ suffixData, delta })),
    )}`;
    const result = await resolve(did);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("deltaHash");
  });

  it("rejects non-canonically encoded initial state", async () => {
    const did = longFormFor(REPLACE_DELTA);
    const [, , suffix, state] = did.split(":");
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString(),
    ) as Record<string, unknown>;
    // Same content, non-canonical spelling (insertion order + whitespace).
    const sloppy = Buffer.from(
      JSON.stringify(
        { delta: decoded.delta, suffixData: decoded.suffixData },
        null,
        1,
      ),
    ).toString("base64url");
    const result = await resolve(`did:ion:${suffix}:${sloppy}`);
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
    expect(result.didResolutionMetadata.message).toContain("canonically");
  });

  it("rejects unsupported patch actions", async () => {
    const did = longFormFor({
      patches: [{ action: "ietf-json-patch", patches: [] }],
      updateCommitment: multihash("u"),
    });
    const result = await resolve(did);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("ietf-json-patch");
  });

  it("rejects duplicate key ids and unknown purposes", async () => {
    const dup = longFormFor({
      patches: [
        {
          action: "replace",
          document: {
            publicKeys: [
              { id: "k", type: "T", publicKeyJwk: JWK, purposes: [] },
              { id: "k", type: "T", publicKeyJwk: JWK, purposes: [] },
            ],
          },
        },
      ],
      updateCommitment: multihash("u"),
    });
    expect((await resolve(dup)).didResolutionMetadata.error).toBe(
      "invalidDidDocument",
    );
    const badPurpose = longFormFor({
      patches: [
        {
          action: "replace",
          document: {
            publicKeys: [
              { id: "k", type: "T", publicKeyJwk: JWK, purposes: ["signing"] },
            ],
          },
        },
      ],
      updateCommitment: multihash("u"),
    });
    expect((await resolve(badPurpose)).didResolutionMetadata.error).toBe(
      "invalidDidDocument",
    );
  });
});

// ── Short-form: endpoint-backed ─────────────────────────────────────────────

describe("did:ion short-form (endpoint-backed)", () => {
  it("passes the anchored document and its Sidetree metadata through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          `${ENDPOINT}/identifiers/${encodeURIComponent(SHORT_FORM_DID)}`,
        );
        return Response.json(SHORT_FORM_UPSTREAM);
      }),
    );
    const result = await resolve(SHORT_FORM_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument).toEqual(SHORT_FORM_UPSTREAM.didDocument);
    // canonicalId / method.published / commitments preserved verbatim.
    expect(result.didDocumentMetadata).toEqual(
      SHORT_FORM_UPSTREAM.didDocumentMetadata,
    );
  });

  it("forwards versionId and versionTime resolution options", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        expect(url.searchParams.get("versionId")).toBe("42");
        expect(url.searchParams.get("versionTime")).toBe(
          "2026-01-01T00:00:00Z",
        );
        return Response.json(SHORT_FORM_UPSTREAM);
      }),
    );
    const result = await resolve(SHORT_FORM_DID, {
      versionId: "42",
      versionTime: "2026-01-01T00:00:00Z",
    });
    expect(result.didResolutionMetadata.error).toBeUndefined();
  });

  it("normalizes Sidetree not-found responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: "did_not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const result = await resolve(SHORT_FORM_DID);
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("returns a deactivated DID as a tombstone, not an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              didDocument: { id: SHORT_FORM_DID },
              didDocumentMetadata: { deactivated: true },
              didResolutionMetadata: {},
            }),
            { status: 410, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const result = await resolve(SHORT_FORM_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("rejects a document for a different DID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          didDocument: { id: "did:ion:EiAother" },
          didDocumentMetadata: {},
          didResolutionMetadata: {},
        }),
      ),
    );
    const result = await resolve(SHORT_FORM_DID);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });

  it("rejects an oversized endpoint response before parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[".repeat(2 * 1024 * 1024))),
    );
    const result = await resolve(SHORT_FORM_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });
});

describe("did:ion without a configured endpoint", () => {
  it("reports notConfigured for short-form; long-form is unaffected", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const bare = getResolver().ion;
    const shortForm = await bare(
      SHORT_FORM_DID,
      null as never,
      null as never,
      {} as never,
    );
    expect(shortForm.didResolutionMetadata.error).toBe("notConfigured");
    const longForm = await bare(
      LONG_FORM_DID,
      null as never,
      null as never,
      {} as never,
    );
    expect(longForm.didResolutionMetadata.error).toBeUndefined();
    expect(longForm.didDocument).toEqual(LONG_FORM_EXPECTED.didDocument);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Input handling ──────────────────────────────────────────────────────────

describe("did:ion input handling", () => {
  it("rejects malformed identifiers and the sunset test network offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (await resolve("did:ion:notasuffix")).didResolutionMetadata.error,
    ).toBe("invalidDid");
    expect(
      (await resolve(`did:ion:test:${SHORT_FORM_DID.split(":")[2]}`))
        .didResolutionMetadata.error,
    ).toBe("notFound");
    expect(
      (await resolve("did:ion:" + "E".repeat(46) + ":a:b"))
        .didResolutionMetadata.error,
    ).toBe("invalidDid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
