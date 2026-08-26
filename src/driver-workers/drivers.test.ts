import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

import cheqdWorker from "./cheqd";
import cidWorker from "./cid";
import dhtWorker from "./dht";
import dnsWorker from "./dns";
import ebsiWorker from "./ebsi";
import empeWorker from "./empe";
import ensWorker from "./ens";
import ethrWorker from "./ethr";
import hederaWorker from "./hedera";
import iden3Worker from "./iden3";
import ionWorker from "./ion";
import iotaWorker from "./iota";
import jwkWorker from "./jwk";
import keyWorker from "./key";
import nearWorker from "./near";
import peerWorker from "./peer";
import pkhWorker from "./pkh";
import plcWorker from "./plc";
import polygonidWorker from "./polygonid";
import solWorker from "./sol";
import tzWorker from "./tz";
import webWorker from "./web";
import webvhWorker from "./webvh";
import xrplWorker from "./xrpl";
import type { DriverResponseV1 } from "./contract";
import { createDriverWorker } from "./runtime";
import { hasLocalDriver } from "../resolvers/local";
import { LOCAL_DRIVER_METHODS } from "../methods";
import {
  ARCHON_NODE_DID,
  FIXTURE,
} from "../../vendor/cid-did-resolver/src/__tests__/fixture";
import {
  LONG_FORM_DID as ION_LONG_FORM_DID,
  LONG_FORM_EXPECTED as ION_LONG_FORM_EXPECTED,
  SHORT_FORM_DID as ION_SHORT_FORM_DID,
} from "../../vendor/ion-did-resolver/src/__tests__/fixture";
import {
  DEVNET_DID as SOL_DEVNET_DID,
  KEY2_PUBKEY as SOL_KEY2_PUBKEY,
  LEGACY_ACCOUNT_B64 as SOL_LEGACY_ACCOUNT_B64,
  LEGACY_PROGRAM as SOL_LEGACY_PROGRAM,
} from "../../vendor/sol-did-resolver/src/__tests__/fixture";
import {
  REFERENCE_DOCUMENT as HEDERA_REFERENCE_DOCUMENT,
  TESTNET_DID as HEDERA_TESTNET_DID,
  TOPIC_MESSAGES as HEDERA_TOPIC_MESSAGES,
} from "../../vendor/hedera-did-resolver/src/__tests__/fixture";
import {
  MAINNET_DID as XRPL_MAINNET_DID,
  MAINNET_REFERENCE_DOCUMENT as XRPL_REFERENCE_DOCUMENT,
  MAINNET_RESPONSE as XRPL_MAINNET_RESPONSE,
} from "../../vendor/xrpl-did-resolver/src/__tests__/fixture";
import {
  AMOY_DID as IDEN3_AMOY_DID,
  POLYGONID_MAIN_DID,
  RAW_GIST_PROOF_RETURN as IDEN3_RAW_GIST_PROOF,
  RAW_ROOT_INFO_RETURN as IDEN3_RAW_ROOT_INFO,
  RAW_STATE_RETURN as IDEN3_RAW_STATE,
  REFERENCE_DOCUMENT as IDEN3_REFERENCE_DOCUMENT,
} from "../../vendor/iden3-did-resolver/src/__tests__/fixture";
import {
  IOTA_MAINNET_CHAIN_ID,
  IOTA_VM_DID,
  IOTA_VM_OBJECT,
} from "../../vendor/iota-did-resolver/src/__tests__/fixture";
import {
  EMPE_OK_RESPONSE,
  EMPE_TESTNET_DID,
} from "../../vendor/empe-did-resolver/src/__tests__/fixture";
import {
  PKARR_LIVE_KEY,
  PKARR_LIVE_PAYLOAD,
} from "../../vendor/dht-did-resolver/src/__tests__/fixture";
import { TZ_REVEALED } from "../../vendor/tz-did-resolver/src/__tests__/fixture";

afterEach(() => vi.unstubAllGlobals());

async function resolve(
  worker: { fetch(request: Request, env: never): Promise<Response> },
  did: string,
  env: unknown = {},
): Promise<DriverResponseV1> {
  const request = new Request("https://driver.internal/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ protocol: 1, did }),
  });
  const response = await worker.fetch(request, env as never);
  expect(response.status).toBe(200);
  return (await response.json()) as DriverResponseV1;
}

describe("Tier 1 driver Workers", () => {
  it("can create a fresh resolver for each stateless Worker request", async () => {
    let registries = 0;
    const worker = createDriverWorker({
      method: "test",
      packageName: "test-driver",
      packageVersion: "1.0.0",
      cacheResolver: false,
      registry: () => {
        registries++;
        return {
          test: async (did: string) => ({
            didResolutionMetadata: {},
            didDocument: { id: did },
            didDocumentMetadata: {},
          }),
        };
      },
    });

    await resolve(worker, "did:test:first");
    await resolve(worker, "did:test:second");
    expect(registries).toBe(2);
  });

  it("resolves an Ed25519 did:key vector offline", async () => {
    const did = "did:key:z6MktvqCyLxTsXUH1tUZncNdVeEZ7hNh7npPRbUU27GTrYb8";
    const body = await resolve(keyWorker, did);
    expect(body.driver).toMatchObject({
      method: "key",
      packageName: "key-did-resolver",
      packageVersion: "4.0.0",
    });
    expect(body.result.didDocument?.id).toBe(did);
  });

  it("resolves a CAIP-10 did:pkh vector offline", async () => {
    const did = "did:pkh:eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb";
    expect((await resolve(pkhWorker, did)).result.didDocument?.id).toBe(did);
  });

  it("resolves a numalgo 0 did:peer vector offline", async () => {
    const did = "did:peer:0z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V";
    expect((await resolve(peerWorker, did)).result.didDocument?.id).toBe(did);
  });

  it("does not expose a public-style GET route", async () => {
    const response = await webWorker.fetch(
      new Request("https://driver.internal/resolve"),
      {},
    );
    expect(response.status).toBe(404);
  });

  it("fails closed when the ethr network secret is absent", async () => {
    const body = await resolve(
      ethrWorker,
      "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    );
    expect(body.result.didResolutionMetadata.error).toBe("internalError");
    expect(body.result.didDocument).toBeNull();
  });

  it("rejects a DID for another method at the driver boundary", async () => {
    const body = await resolve(keyWorker, "did:web:example.com");
    expect(body.result.didResolutionMetadata.error).toBe("invalidDid");
  });

  it("resolves a did:plc document from the configured directory", async () => {
    const did = "did:plc:z72i7hdynmk6r22z27h6tvur";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          `https://plc.test/${encodeURIComponent(did)}`,
        );
        return Response.json({ id: did });
      }),
    );
    const body = await resolve(plcWorker, did, {
      PLC_DIRECTORY_URL: "https://plc.test",
    });
    expect(body.driver).toMatchObject({
      method: "plc",
      packageName: "@thisdid/plc-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(did);
  });

  it("maps a plc directory 404 to notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const body = await resolve(plcWorker, "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(body.result.didResolutionMetadata.error).toBe("notFound");
    expect(body.result.didDocument).toBeNull();
  });

  it("fails a webvh resolution when the DID log is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const body = await resolve(
      webvhWorker,
      "did:webvh:QmUnreachableScid1234:example.com",
    );
    expect(body.driver).toMatchObject({
      method: "webvh",
      packageName: "@thisdid/webvh-did-resolver",
    });
    expect(body.result.didDocument).toBeNull();
    expect(body.result.didResolutionMetadata.error).toBe("notFound");
  });

  it("rejects a non-webvh DID at the webvh driver boundary", async () => {
    const body = await resolve(webvhWorker, "did:web:example.com");
    expect(body.result.didResolutionMetadata.error).toBe("invalidDid");
  });

  it("fails closed when the ebsi registry var is absent", async () => {
    const body = await resolve(ebsiWorker, "did:ebsi:zZeKyEJfUTGwajhNyNX928z");
    expect(body.result.didResolutionMetadata.error).toBe("internalError");
    expect(body.result.didDocument).toBeNull();
  });

  it("resolves a did:ebsi legal entity from the configured registry", async () => {
    // The EBSI package resolves over axios; its hoisted instance is shared, so
    // pointing it at the fetch adapter lets the stubbed global fetch serve the
    // registry document offline while the real package code runs.
    const did = "did:ebsi:zZeKyEJfUTGwajhNyNX928z";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      expect(url).toBe(`https://registry.test/${did}`);
      return Response.json({
        "@context": ["https://www.w3.org/ns/did/v1"],
        id: did,
        controller: [did],
        verificationMethod: [
          {
            id: `${did}#key-1`,
            type: "JsonWebKey2020",
            controller: did,
            publicKeyJwk: { crv: "secp256k1", kty: "EC", x: "x", y: "y" },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = "fetch";
    try {
      const body = await resolve(ebsiWorker, did, {
        EBSI_DID_REGISTRY: "https://registry.test",
      });
      expect(body.driver).toMatchObject({
        method: "ebsi",
        packageName: "@cef-ebsi/ebsi-did-resolver",
      });
      expect(body.result.didResolutionMetadata.error).toBeUndefined();
      expect(body.result.didDocument?.id).toBe(did);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      axios.defaults.adapter = originalAdapter;
    }
  });

  it("resolves a NEAR implicit account offline through the vendored driver", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const did =
      "did:near:98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de";
    const body = await resolve(nearWorker, did, {
      NEAR_RPC_MAINNET_URL: "https://rpc.main.test",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.driver).toMatchObject({
      method: "near",
      packageName: "@thisdid/near-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(did);
    expect(body.result.didDocument?.verificationMethod?.[0]?.type).toBe(
      "Ed25519VerificationKey2018",
    );
  });

  it("resolves the did:jwk P-256 spec vector offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const did =
      "did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6ImFjYklRaXVNczNpOF91c3pFakoydHBUdFJNNEVVM3l6OTFQSDZDZEgyVjAiLCJ5IjoiX0tjeUxqOXZXTXB0bm1LdG00NkdxRHo4d2Y3NEk1TEtncmwyR3pIM25TRSJ9";
    const body = await resolve(jwkWorker, did);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.driver).toMatchObject({
      method: "jwk",
      packageName: "@thisdid/jwk-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(did);
    expect(body.result.didDocument?.verificationMethod?.[0]?.id).toBe(
      `${did}#0`,
    );
  });

  it("rejects a did:jwk embedding private key material", async () => {
    const did =
      "did:jwk:" +
      Buffer.from(
        JSON.stringify({
          kty: "OKP",
          crv: "Ed25519",
          x: "O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik",
          d: "nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A",
        }),
      ).toString("base64url");
    const body = await resolve(jwkWorker, did);
    expect(body.result.didResolutionMetadata.error).toBe("invalidDid");
    expect(body.result.didDocument).toBeNull();
  });

  it("resolves did:cheqd through the configured cheqd resolver", async () => {
    const did = "did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("resolver.cheqd.net/1.0/identifiers");
        return Response.json({
          didDocument: { id: did, verificationMethod: [] },
          didResolutionMetadata: {},
          didDocumentMetadata: { versionId: "v1" },
        });
      }),
    );
    const body = await resolve(cheqdWorker, did);
    expect(body.driver).toMatchObject({
      method: "cheqd",
      packageName: "@thisdid/cheqd-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(did);
  });

  it("resolves did:dns over DoH with offline did:key recursion", async () => {
    const did = "did:dns:danubetech.com";
    const HEX =
      "\\# 60 00 64 00 0a 64 69 64 3a 6b 65 79 3a 7a 36 4d 6b 6a 76 42 6b 74 38 45 54 6e 78 58 47 42 46 50 53 47 67 59 4b 62 34 33 71 37 6f 4e 48 4c 58 38 42 69 59 53 50 63 58 56 47 36 67 59 36";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const name = new URL(String(input)).searchParams.get("name");
        return Response.json(
          name === "_key1._did.danubetech.com"
            ? { Status: 0, Answer: [{ name, type: 256, data: HEX }] }
            : { Status: 0 },
        );
      }),
    );
    const body = await resolve(dnsWorker, did);
    expect(body.driver).toMatchObject({
      method: "dns",
      packageName: "@thisdid/dns-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(did);
    // The VM fragment is the did:key's own multibase, matching the Danube Tech
    // reference driver and the did:dns spec example (not a positional #key1).
    expect(body.result.didDocument?.verificationMethod?.[0]?.id).toBe(
      `${did}#z6MkjvBkt8ETnxXGBFPSGgYKb43q7oNHLX8BiYSPcXVG6gY6`,
    );
  });

  it("chain-verifies did:cid from a Gatekeeper event export", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          "https://gatekeeper.test/api/v1/dids/export",
        );
        return Response.json([FIXTURE.events]);
      }),
    );
    const body = await resolve(cidWorker, ARCHON_NODE_DID, {
      CID_GATEKEEPER_URL: "https://gatekeeper.test/api/v1",
    });
    expect(body.driver).toMatchObject({
      method: "cid",
      packageName: "@thisdid/cid-did-resolver",
    });
    expect(body.result.didDocument).toEqual(FIXTURE.expected.didDocument);
    expect(body.result.didDocumentMetadata).toEqual(
      FIXTURE.expected.didDocumentMetadata,
    );
  });

  it("resolves a long-form did:ion fully offline with verification", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = await resolve(ionWorker, ION_LONG_FORM_DID);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.driver).toMatchObject({
      method: "ion",
      packageName: "@thisdid/ion-did-resolver",
    });
    expect(body.result.didDocument).toEqual(ION_LONG_FORM_EXPECTED.didDocument);
    expect(body.result.didDocumentMetadata).toEqual(
      ION_LONG_FORM_EXPECTED.didDocumentMetadata,
    );
  });

  it("fetches short-form did:ion from the configured Sidetree endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          `https://ion.test/1.0/identifiers/${encodeURIComponent(ION_SHORT_FORM_DID)}`,
        );
        return Response.json({
          didDocument: { id: ION_SHORT_FORM_DID },
          didDocumentMetadata: { canonicalId: ION_SHORT_FORM_DID },
          didResolutionMetadata: {},
        });
      }),
    );
    const body = await resolve(ionWorker, ION_SHORT_FORM_DID, {
      ION_RESOLUTION_ENDPOINT: "https://ion.test/1.0",
    });
    expect(body.result.didDocument?.id).toBe(ION_SHORT_FORM_DID);
    expect(body.result.didDocumentMetadata.canonicalId).toBe(
      ION_SHORT_FORM_DID,
    );
  });

  it("resolves a legacy-program did:sol from a devnet account fixture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://sol-devnet.test");
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: {
            value: [
              null,
              {
                owner: SOL_LEGACY_PROGRAM,
                data: [SOL_LEGACY_ACCOUNT_B64, "base64"],
              },
            ],
          },
        });
      }),
    );
    const body = await resolve(solWorker, SOL_DEVNET_DID, {
      SOL_RPC_DEVNET_URL: "https://sol-devnet.test",
    });
    expect(body.driver).toMatchObject({
      method: "sol",
      packageName: "@thisdid/sol-did-resolver",
    });
    expect(body.result.didDocument?.capabilityInvocation).toEqual([
      `${SOL_DEVNET_DID}#key2`,
    ]);
    expect(
      body.result.didDocument?.verificationMethod?.[1]?.publicKeyBase58,
    ).toBe(SOL_KEY2_PUBKEY);
  });

  it("composes did:iden3 from raw Amoy State-contract returns", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://amoy.rpc.test");
        call++;
        return Response.json(
          call === 1
            ? [
                { jsonrpc: "2.0", id: 0, result: IDEN3_RAW_STATE },
                { jsonrpc: "2.0", id: 1, result: IDEN3_RAW_GIST_PROOF },
              ]
            : [{ jsonrpc: "2.0", id: 0, result: IDEN3_RAW_ROOT_INFO }],
        );
      }),
    );
    const body = await resolve(iden3Worker, IDEN3_AMOY_DID, {
      IDEN3_RPC_POLYGON_AMOY_URL: "https://amoy.rpc.test",
    });
    expect(body.driver).toMatchObject({
      method: "iden3",
      packageName: "@thisdid/iden3-did-resolver",
    });
    expect(body.result.didDocument).toEqual(IDEN3_REFERENCE_DOCUMENT);
  });

  it("resolves did:polygonid (unpublished) through its own worker", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://polygon.rpc.test");
        call++;
        return Response.json(
          call === 1
            ? [
                {
                  jsonrpc: "2.0",
                  id: 0,
                  error: {
                    message: "execution reverted: Identity does not exist",
                  },
                },
                { jsonrpc: "2.0", id: 1, result: IDEN3_RAW_GIST_PROOF },
              ]
            : [{ jsonrpc: "2.0", id: 0, result: IDEN3_RAW_ROOT_INFO }],
        );
      }),
    );
    const body = await resolve(polygonidWorker, POLYGONID_MAIN_DID, {
      POLYGONID_RPC_POLYGON_MAIN_URL: "https://polygon.rpc.test",
    });
    expect(body.driver).toMatchObject({
      method: "polygonid",
      packageName: "@thisdid/iden3-did-resolver",
    });
    const vm = body.result.didDocument
      ?.verificationMethod?.[0] as unknown as Record<string, unknown>;
    expect(vm.published).toBe(false);
    expect(vm.id).toBe(`${POLYGONID_MAIN_DID}#state-info`);
  });

  it("resolves did:hedera from public mirror-node topic messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain(
          "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.7280148/messages",
        );
        return Response.json({
          messages: HEDERA_TOPIC_MESSAGES.messages.map((m) => ({
            message: m.message,
          })),
          links: { next: null },
        });
      }),
    );
    const body = await resolve(hederaWorker, HEDERA_TESTNET_DID);
    expect(body.driver).toMatchObject({
      method: "hedera",
      packageName: "@thisdid/hedera-did-resolver",
    });
    expect(body.result.didDocument).toEqual(HEDERA_REFERENCE_DOCUMENT);
    expect(body.result.didDocumentMetadata.deactivated).toBe(false);
  });

  it("resolves did:xrpl from the native XLS-40 ledger entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://xrplcluster.com");
        const rpc = JSON.parse(String(init?.body)) as {
          method: string;
          params: [{ did: string }];
        };
        expect(rpc.method).toBe("ledger_entry");
        expect(rpc.params[0].did).toBe("r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE");
        return Response.json(XRPL_MAINNET_RESPONSE);
      }),
    );
    const body = await resolve(xrplWorker, XRPL_MAINNET_DID);
    expect(body.driver).toMatchObject({
      method: "xrpl",
      packageName: "@thisdid/xrpl-did-resolver",
    });
    expect(body.result.didDocument).toEqual(XRPL_REFERENCE_DOCUMENT);
    expect(body.result.didDocumentMetadata).toMatchObject({
      network: "mainnet",
      deactivated: false,
    });
  });

  it("honors an XRPL RPC endpoint override from worker vars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://xrpl-rpc.example");
        return Response.json(XRPL_MAINNET_RESPONSE);
      }),
    );
    const body = await resolve(xrplWorker, XRPL_MAINNET_DID, {
      XRPL_RPC_MAINNET_URL: "https://xrpl-rpc.example",
    });
    expect(body.result.didDocument).toEqual(XRPL_REFERENCE_DOCUMENT);
  });

  it("resolves did:iota from a mainnet Identity Move object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://api.mainnet.iota.cafe");
        const rpc = JSON.parse(String(init?.body)) as { method: string };
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result:
            rpc.method === "iota_getChainIdentifier"
              ? IOTA_MAINNET_CHAIN_ID
              : IOTA_VM_OBJECT,
        });
      }),
    );
    const body = await resolve(iotaWorker, IOTA_VM_DID);
    expect(body.driver).toMatchObject({
      method: "iota",
      packageName: "@thisdid/iota-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(IOTA_VM_DID);
    expect(
      body.result.didDocument?.verificationMethod?.[0].publicKeyJwk?.crv,
    ).toBe("Ed25519");
    expect(body.result.didDocumentMetadata).toMatchObject({
      network: "iota",
      deactivated: false,
    });
  });

  it("resolves did:empe from the testnet diddoc module", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain("https://rpc-testnet.empe.io/abci_query");
        expect(url).toContain("empe.diddoc.Query/DidDocument");
        return Response.json({ result: { response: EMPE_OK_RESPONSE } });
      }),
    );
    const body = await resolve(empeWorker, EMPE_TESTNET_DID);
    expect(body.driver).toMatchObject({
      method: "empe",
      packageName: "@thisdid/empe-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(EMPE_TESTNET_DID);
    expect(body.result.didDocument?.verificationMethod).toHaveLength(2);
  });

  it("fails closed for did:empe mainnet until endpoints exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = await resolve(empeWorker, `did:empe:${"a".repeat(40)}`);
    expect(body.result.didResolutionMetadata.error).toBe("notConfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers did:dht notFound on the relay's 404 and honors overrides", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(`https://relay.example/${PKARR_LIVE_KEY}`);
        return new Response("no record", { status: 404 });
      }),
    );
    const body = await resolve(dhtWorker, `did:dht:${PKARR_LIVE_KEY}`, {
      DHT_RELAY_URLS: "https://relay.example",
    });
    expect(body.driver).toMatchObject({
      method: "dht",
      packageName: "@thisdid/dht-did-resolver",
    });
    expect(body.result.didResolutionMetadata.error).toBe("notFound");
  });

  it("signature-verifies did:dht payloads before serving them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(PKARR_LIVE_PAYLOAD.slice().buffer as ArrayBuffer),
      ),
    );
    const body = await resolve(dhtWorker, `did:dht:${PKARR_LIVE_KEY}`);
    // The live Pkarr record verifies but holds no _did root record.
    expect(body.result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(body.result.didResolutionMetadata.message).toContain("root record");
  });

  it("resolves did:tz with BLAKE2b-verified key discovery", async () => {
    const { address, publicKey } = TZ_REVEALED.tz3;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain(
          `https://api.tzkt.io/v1/accounts/${address}`,
        );
        return Response.json({ publicKey, revealed: true });
      }),
    );
    const body = await resolve(tzWorker, `did:tz:${address}`);
    expect(body.driver).toMatchObject({
      method: "tz",
      packageName: "@thisdid/tz-did-resolver",
    });
    const vm = body.result.didDocument
      ?.verificationMethod?.[0] as unknown as Record<string, unknown>;
    expect(vm.type).toBe(
      "P256PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021",
    );
    expect(vm.publicKeyBase58).toBe(publicKey);
    expect(body.result.didDocumentMetadata.keyDiscovery).toBe("verified");
  });

  it("fails closed when the iden3 network RPC secret is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = await resolve(iden3Worker, IDEN3_AMOY_DID);
    expect(body.result.didResolutionMetadata.error).toBe("notConfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the sol cluster RPC secret is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = await resolve(solWorker, SOL_DEVNET_DID);
    expect(body.result.didResolutionMetadata.error).toBe("notConfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the ens RPC secret is absent", async () => {
    const body = await resolve(ensWorker, "did:ens:vitalik.eth");
    expect(body.result.didResolutionMetadata.error).toBe("internalError");
    expect(body.result.didDocument).toBeNull();
  });

  it("fails closed when no NEAR RPC endpoint is configured", async () => {
    const body = await resolve(nearWorker, "did:near:alice.near");
    expect(body.result.didResolutionMetadata.error).toBe("internalError");
    expect(body.result.didDocument).toBeNull();
  });
});

describe("mother dispatch parity", () => {
  it("maps every LOCAL_DRIVER_METHODS entry to its DRIVER_* binding", () => {
    // All DriverBindings members are optional, so a method added to the list
    // without a dispatch case in bindingFor() is invisible to typechecking —
    // it would silently report notConfigured in production. The recording
    // proxy proves each method reaches exactly its conventional binding.
    for (const method of LOCAL_DRIVER_METHODS) {
      const accessed: string[] = [];
      const env = new Proxy(
        {},
        {
          get: (_target, property) => {
            accessed.push(String(property));
            return { fetch: async () => new Response() };
          },
        },
      );
      expect(
        hasLocalDriver(method, env as never),
        `no bindingFor() dispatch case for \`${method}\``,
      ).toBe(true);
      expect(accessed, `unexpected binding lookup for \`${method}\``).toEqual([
        `DRIVER_${method.toUpperCase()}`,
      ]);
    }
  });
});
