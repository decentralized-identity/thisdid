import { describe, expect, it } from "vitest";
import {
  FALLBACK_REGISTRY,
  isValidRegistry,
  foldComposeKey,
  joinDrivers,
  parseComposeMethods,
  parseFindings,
  parseReadmeDrivers,
  parseServiceImages,
  parseServiceMap,
} from "./dif";

const COMPOSE_SAMPLE = `
services:
  uni-resolver-web:
    image: universalresolver/uni-resolver-web:latest
    environment:
      uniresolver_web_driver_url_did_btcr:
      uniresolver_web_driver_url_did_v1_nym:
      uniresolver_web_driver_url_did_v1_test_nym:
      uniresolver_web_driver_url_did_elem_ropsten:
      uniresolver_web_driver_url_did_ala_quor_redt:
      uniresolver_web_driver_url_did_web:
      uniresolver_web_driver_url_did_kscirc: http://did-kscirc-driver:9800/
  driver-did-btcr:
    image: universalresolver/driver-did-btcr:0.9
  uni-resolver-driver-did-web:
    image: example/driver-did-web:1.2.3
`;

describe("compose parsing", () => {
  it("extracts distinct methods, folding network variants", () => {
    expect(parseComposeMethods(COMPOSE_SAMPLE)).toEqual([
      "ala",
      "btcr",
      "elem",
      "kscirc",
      "v1",
      "web",
    ]);
  });

  it("folds only the known variant keys", () => {
    expect(foldComposeKey("v1_nym")).toBe("v1");
    expect(foldComposeKey("elem_ropsten")).toBe("elem");
    expect(foldComposeKey("ala_quor_redt")).toBe("ala");
    expect(foldComposeKey("iden3")).toBe("iden3");
  });

  it("joins app.yml services, compose images, and README rows per method", () => {
    const serviceMap = parseServiceMap(
      "url: \u0024{uniresolver_web_driver_url_did_btcr:http://driver-did-btcr:8080/}\n" +
        "url: \u0024{uniresolver_web_driver_url_did_v1_nym:http://driver-did-v1:8080/}",
    );
    expect(serviceMap).toEqual({
      btcr: "driver-did-btcr",
      v1: "driver-did-v1",
    });
    const images = parseServiceImages(COMPOSE_SAMPLE);
    expect(images["driver-did-btcr"]).toBe(
      "universalresolver/driver-did-btcr:0.9",
    );
    const rows = parseReadmeDrivers(
      "| [did-btcr](https://github.com/decentralized-identity/uni-resolver-driver-did-btcr/) | 0.1 | [0.1](https://spec) | [universalresolver/driver-did-btcr](https://hub.docker.com/r/universalresolver/driver-did-btcr/) | notes |\n" +
        "| [did-cheqd](https://github.com/cheqd/did-resolver) | 3.7.7 | [1.0](https://spec) | ghcr text only | notes |",
    );
    expect(rows["did-btcr"].repo).toContain("uni-resolver-driver-did-btcr");
    expect(rows["did-cheqd"]).toEqual({
      repo: "https://github.com/cheqd/did-resolver",
    });
    const drivers = joinDrivers(["btcr", "cheqd"], serviceMap, images, rows);
    expect(drivers.btcr).toEqual({
      image: "universalresolver/driver-did-btcr:0.9",
      repo: "https://github.com/decentralized-identity/uni-resolver-driver-did-btcr/",
      hub: "https://hub.docker.com/r/universalresolver/driver-did-btcr/",
    });
    // No image mapping, but the README row still supplies the repo.
    expect(drivers.cheqd.repo).toBe("https://github.com/cheqd/did-resolver");
  });
});

describe("did-methods findings parsing", () => {
  it("extracts method ids and links, dropping the example entry", () => {
    const entries = parseFindings([
      { name: "README.md", html_url: "https://x/readme" },
      { name: "findings-did-webvh.md", html_url: "https://x/webvh" },
      { name: "findings-did-example.md", html_url: "https://x/example" },
      { name: "findings-did-cid.md", html_url: "https://x/cid" },
      { name: "not-a-finding.txt", html_url: "https://x/nope" },
    ]);
    expect(entries).toEqual([
      { id: "cid", url: "https://x/cid" },
      { id: "webvh", url: "https://x/webvh" },
    ]);
  });
});

describe("stored-registry validation", () => {
  it("accepts the current shape and rejects corrupt or older values", () => {
    expect(isValidRegistry(FALLBACK_REGISTRY)).toBe(true);
    expect(isValidRegistry(null)).toBe(false);
    expect(isValidRegistry({})).toBe(false);
    // Older schema (no version / no drivers) must fall back, not crash pages.
    expect(
      isValidRegistry({
        syncedAt: 1,
        composeMethods: FALLBACK_REGISTRY.composeMethods,
        images: {},
        recommended: [],
        endorsed: [],
      }),
    ).toBe(false);
    // A collapsed catalog is shape drift, not data.
    expect(
      isValidRegistry({ ...FALLBACK_REGISTRY, composeMethods: ["web"] }),
    ).toBe(false);
  });
});

describe("vendored fallback", () => {
  it("carries the verified 67-method compose catalog and the recommended set", () => {
    expect(FALLBACK_REGISTRY.composeMethods).toHaveLength(67);
    expect(FALLBACK_REGISTRY.composeMethods).toContain("sov");
    expect(FALLBACK_REGISTRY.composeMethods).toContain("kilt");
    // Every compose method carries its researched docker-driver entry.
    expect(Object.keys(FALLBACK_REGISTRY.drivers)).toHaveLength(67);
    for (const method of FALLBACK_REGISTRY.composeMethods) {
      expect(FALLBACK_REGISTRY.drivers[method]).toBeDefined();
      expect(FALLBACK_REGISTRY.drivers[method].repo).toMatch(/^https?:/);
    }
    expect(FALLBACK_REGISTRY.drivers.btcr.image).toContain("driver-did-btcr");
    expect(FALLBACK_REGISTRY.drivers.hedera.repo).toContain("hiero-ledger");
    expect(FALLBACK_REGISTRY.recommended.map((r) => r.id)).toEqual([
      "cid",
      "ethr",
      "hedera",
      "webplus",
      "webvh",
    ]);
    expect(FALLBACK_REGISTRY.endorsed).toEqual([]);
  });
});
