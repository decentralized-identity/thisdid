/**
 * Daily DIF registry sync — the directory's live link to the ecosystem.
 *
 *   1. The Universal Resolver's docker-compose.yml: the
 *      `uniresolver_web_driver_url_did_*` env keys are the dockerized driver
 *      catalog (network variants fold into their method), and the `services:`
 *      blocks yield a best-effort driver image per method.
 *   2. The DID Methods WG repo (`decentralized-identity/did-methods`): the
 *      `dif-recommended/` and `dif-endorsed/` listings, each entry linking
 *      its `findings-did-<method>.md`.
 *
 * Parsers are FAIL-CLOSED: on fetch failure or shape drift the previously
 * stored value is kept and the error logged — a bad sync can never blank the
 * data. A vendored snapshot (verified 23 Aug 2026) covers the very first
 * run. Storage is the D1 `directory_store` table — no KV involvement.
 */
import { storeGet, storePut } from "./store";
import type { DifRegistry, Env } from "./types";

import { DIF_REGISTRY_VERSION } from "../../src/dif-registry-contract";

export const DIF_REGISTRY_KEY = "dif-registry";
export { DIF_REGISTRY_VERSION };

const UR_RAW =
  "https://raw.githubusercontent.com/decentralized-identity/universal-resolver/main";
const COMPOSE_URL = UR_RAW + "/docker-compose.yml";
const APP_YML_URL =
  UR_RAW + "/uni-resolver-web/src/main/resources/application.yml";
const README_URL = UR_RAW + "/README.md";
const DID_METHODS_CONTENTS =
  "https://api.github.com/repos/decentralized-identity/did-methods/contents";

/** Network-variant env keys fold into their method id. */
const KEY_FOLDS: Record<string, string> = {
  v1_nym: "v1",
  v1_test_nym: "v1",
  elem_ropsten: "elem",
  ala_quor_redt: "ala",
};

export function foldComposeKey(key: string): string {
  return KEY_FOLDS[key] ?? key;
}

/** Extract the distinct method catalog from the compose env keys. */
export function parseComposeMethods(yaml: string): string[] {
  const methods = new Set<string>();
  const re = /uniresolver_web_driver_url_did_([a-z0-9_]+)\s*:/g;
  for (const match of yaml.matchAll(re)) {
    methods.add(foldComposeKey(match[1]));
  }
  return [...methods].sort();
}

/** application.yml: env-key defaults map each method to its driver service. */
export function parseServiceMap(appYaml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re =
    /uniresolver_web_driver_url_did_([a-z0-9_]+):http:\/\/([a-z0-9-]+):\d+/g;
  for (const match of appYaml.matchAll(re)) {
    const method = foldComposeKey(match[1]);
    out[method] ??= match[2];
  }
  return out;
}

/** Compose services: service name → image. */
export function parseServiceImages(yaml: string): Record<string, string> {
  const out: Record<string, string> = {};
  let service: string | null = null;
  for (const line of yaml.split("\n")) {
    const serviceMatch = line.match(/^ {2}([a-z0-9-]+):\s*$/);
    if (serviceMatch) {
      service = serviceMatch[1];
      continue;
    }
    const imageMatch = line.match(/^ {4}image:\s*(\S+)/);
    if (imageMatch && service) out[service] = imageMatch[1];
  }
  return out;
}

/** README driver table: driver name → source repo + Docker Hub page. */
export function parseReadmeDrivers(
  readme: string,
): Record<string, { repo: string; hub?: string }> {
  const out: Record<string, { repo: string; hub?: string }> = {};
  const re =
    /^\| \[([^\]]+)\]\((https?:\/\/[^)]+)\)[^|]*\|[^|]*\|[^|]*\|([^|]*)\|/gm;
  for (const match of readme.matchAll(re)) {
    const hub = match[3].match(/\((https?:\/\/[^)]+)\)/)?.[1];
    out[match[1].toLowerCase().trim()] = {
      repo: match[2],
      ...(hub ? { hub } : {}),
    };
  }
  return out;
}

/** Join the three sources into the per-method docker-driver map. */
export function joinDrivers(
  methods: string[],
  serviceMap: Record<string, string>,
  serviceImages: Record<string, string>,
  readmeRows: Record<string, { repo: string; hub?: string }>,
): DifRegistry["drivers"] {
  const out: DifRegistry["drivers"] = {};
  for (const method of methods) {
    const service = serviceMap[method];
    const image = service ? serviceImages[service] : undefined;
    let row = readmeRows["did-" + method];
    if (!row && image) {
      const base = image.split(":")[0].split("/").pop();
      for (const candidate of Object.values(readmeRows)) {
        if (candidate.hub?.replace(/\/+$/, "").endsWith("/" + base)) {
          row = candidate;
          break;
        }
      }
    }
    let hub = row?.hub;
    if (!hub && image) {
      const base = image.split(":")[0];
      if (base.includes("/") && !base.startsWith("ghcr")) {
        hub = "https://hub.docker.com/r/" + base;
      }
    }
    const entry: { image?: string; repo?: string; hub?: string } = {};
    if (image) entry.image = image;
    if (row?.repo) entry.repo = row.repo;
    if (hub) entry.hub = hub;
    out[method] = entry;
  }
  return out;
}

interface ContentsEntry {
  name?: string;
  html_url?: string;
}

/** `findings-did-<method>.md` listings → {id, url} entries. */
export function parseFindings(
  entries: ContentsEntry[],
): { id: string; url: string }[] {
  const out: { id: string; url: string }[] = [];
  for (const entry of entries) {
    const match =
      typeof entry.name === "string" &&
      entry.name.match(/^findings-did-([a-z0-9]+)\.md$/);
    if (match && match[1] !== "example" && typeof entry.html_url === "string") {
      out.push({ id: match[1], url: entry.html_url });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Vendored snapshot — the state verified live on 23 August 2026, used until
 * the first successful sync (and as the floor the sync can never fall below
 * in count without being rejected as shape drift).
 */
export const FALLBACK_REGISTRY: DifRegistry = {
  v: DIF_REGISTRY_VERSION,
  syncedAt: 0,
  composeMethods: [
    "ace",
    "ala",
    "bba",
    "bid",
    "bluchain",
    "btcr",
    "ccp",
    "cheqd",
    "cndid",
    "com",
    "dns",
    "dock",
    "dyne",
    "ebsi",
    "elem",
    "empe",
    "emtrust",
    "ens",
    "eosio",
    "ethr",
    "ev",
    "evan",
    "everscale",
    "evrc",
    "factom",
    "gatc",
    "github",
    "hcr",
    "hedera",
    "icon",
    "iden3",
    "iid",
    "indy",
    "io",
    "ion",
    "iscc",
    "jolo",
    "jwk",
    "keri",
    "key",
    "kilt",
    "kit",
    "kscirc",
    "lit",
    "meta",
    "moncon",
    "mydata",
    "nfd",
    "ont",
    "orb",
    "oyd",
    "pdc",
    "peer",
    "plc",
    "prism",
    "schema",
    "sol",
    "sov",
    "stack",
    "tgrid",
    "tys",
    "unisot",
    "v1",
    "vaa",
    "web",
    "webplus",
    "webs",
  ],
  drivers: {
    ace: {
      repo: "https://github.com/aceblockID/aceblock-did-resolver",
      hub: "https://hub.docker.com/r/aceblock/ace-did-driver",
    },
    ala: {
      image: "alastria/uni-resolver-driver-did-alastria:mvp2",
      repo: "https://github.com/alastria/uni-resolver-driver-did-alastria",
      hub: "https://hub.docker.com/r/alastria/uni-resolver-driver-did-alastria",
    },
    bba: {
      image: "blobaa/bba-did-driver:0.2.2",
      repo: "https://github.com/blobaa/bba-did-driver",
      hub: "https://hub.docker.com/repository/docker/blobaa/bba-did-driver",
    },
    bid: {
      image: "caictdevelop/driver-did-bid:latest",
      repo: "https://github.com/caict-4iot-dev/uni-resolver-driver-did-bid",
      hub: "https://hub.docker.com/repository/docker/caictdevelop/driver-did-bid",
    },
    bluchain: {
      image: "bluchain/did-driver-bluchain:v1.0.0",
      repo: "https://gitlab.com/blucloud-public/did-driver-bluchain",
      hub: "https://hub.docker.com/repository/docker/bluchain/did-driver-bluchain",
    },
    btcr: {
      image: "universalresolver/driver-did-btcr:latest",
      repo: "https://github.com/decentralized-identity/uni-resolver-driver-did-btcr/",
      hub: "https://hub.docker.com/r/universalresolver/driver-did-btcr/",
    },
    ccp: {
      image: "universalresolver/driver-did-ccp:latest",
      repo: "https://github.com/decentralized-identity/uni-resolver-driver-did-ccp/",
      hub: "https://hub.docker.com/r/hello2mao/driver-did-ccp/",
    },
    cheqd: {
      image: "ghcr.io/cheqd/did-resolver:3.7.7",
      repo: "https://github.com/cheqd/did-resolver",
      hub: "https://github.com/cheqd/did-resolver",
    },
    cndid: {
      image: "teleinfo/driver-did-cndid:v1.0.0",
      repo: "https://github.com/teleinfo-bif/uni-resolver-driver-did-cndid",
      hub: "https://hub.docker.com/repository/docker/teleinfo/driver-did-cndid",
    },
    com: {
      image: "ghcr.io/commercionetwork/uni-resolver-driver-did-com:latest",
      repo: "https://github.com/commercionetwork/uni-resolver-driver-did-com/",
      hub: "https://github.com/commercionetwork/uni-resolver-driver-did-com/pkgs/container/uni-resolver-driver-did-com",
    },
    dns: {
      image: "universalresolver/driver-did-dns:latest",
      repo: "https://github.com/danubetech/uni-resolver-driver-did-dns",
      hub: "https://hub.docker.com/r/universalresolver/driver-did-dns/",
    },
    dock: {
      image: "docknetwork/dock-did-driver:2.0.2",
      repo: "https://github.com/docknetwork/dock-did-driver",
      hub: "https://github.com/docknetwork/dock-did-driver/blob/master/Dock%20DID%20method%20specification.md",
    },
    dyne: {
      image: "dyne/w3c-did-driver:0.2",
      repo: "https://github.com/dyne/W3C-DID",
      hub: "https://hub.docker.com/r/dyne/w3c-did-driver/",
    },
    ebsi: {
      repo: "https://api.preprod.ebsi.eu/docs/#/DID%20Registry",
      hub: "https://api.preprod.ebsi.eu/did-registry/v2/identifiers/",
    },
    elem: {
      repo: "https://github.com/transmute-industries/sidetree.js/tree/main/packages/did-method-element",
    },
    empe: {
      image: "ghcr.io/empe-io/uni-resolver-driver-did-empe:latest",
      repo: "https://github.com/empe-io/uni-resolver-driver-did-empe",
      hub: "https://github.com/empe-io/uni-resolver-driver-did-empe/pkgs/container/uni-resolver-driver-did-empe",
    },
    emtrust: {
      image: "halialabsdev/emtrust_did_driver:latest",
      repo: "https://github.com/Halialabs/did-spec",
      hub: "https://hub.docker.com/r/halialabsdev/emtrust_did_driver",
    },
    ens: {
      image: "uport/uni-resolver-driver-did-uport:5.0.3",
      repo: "https://github.com/uport-project/uport-did-driver",
      hub: "https://hub.docker.com/r/uport/uni-resolver-driver-did-uport/",
    },
    eosio: {
      image: "gimlyblockchain/eosio-universal-resolver-driver",
      repo: "https://github.com/Gimly-Blockchain/eosio-did-universal-resolver-driver",
      hub: "https://hub.docker.com/r/gimlyblockchain/eosio-universal-resolver-driver",
    },
    ethr: {
      image: "uport/uni-resolver-driver-did-uport:5.0.3",
      repo: "https://github.com/uport-project/uport-did-driver",
      hub: "https://hub.docker.com/r/uport/uni-resolver-driver-did-uport/",
    },
    ev: {
      image: "ghcr.io/kaytrust/driver-did-ev:latest",
      repo: "https://github.com/KayTrust/driver-did-ev",
      hub: "http://ghcr.io/kaytrust/driver-did-ev",
    },
    evan: {
      image: "evannetwork/evan-did-driver:0.1.3",
      repo: "https://github.com/evannetwork/did-driver",
      hub: "https://hub.docker.com/r/evannetwork/evan-did-driver",
    },
    everscale: {
      image: "radianceteamssi/everscale-did-resolver-driver:latest",
      repo: "https://git.defispace.com/ssi-4/everscale-resolver-driver",
      hub: "https://hub.docker.com/r/radianceteamssi/everscale-did-resolver-driver",
    },
    evrc: {
      image: "viitorcloud/uni-resolver-driver-did-evrc:v1.1.0",
      repo: "https://github.com/vcian/uni-resolver-driver-did-evrc",
      hub: "https://hub.docker.com/r/viitorcloud/uni-resolver-driver-did-evrc",
    },
    factom: {
      image: "sphereon/uni-resolver-driver-did-factom:latest",
      repo: "https://github.com/Sphereon-Opensource/uni-resolver-driver-did-factom",
      hub: "https://hub.docker.com/r/sphereon/uni-resolver-driver-did-factom",
    },
    gatc: {
      image:
        "ghcr.io/gataca-io/universal-resolver-driver/universal-resolver-driver:3.0.0",
      repo: "https://github.com/gataca-io/universal-resolver-driver",
      hub: "https://hub.docker.com/r/gatacaid/universal-resolver-driver",
    },
    github: { repo: "https://github.com/decentralized-identity/github-did" },
    hcr: {
      image: "hacera/hacera-did-driver:latest",
      repo: "https://github.com/hacera/hacera-did-driver",
      hub: "https://hub.docker.com/r/hacera/hacera-did-driver",
    },
    hedera: {
      image:
        "ghcr.io/hiero-ledger/uni-resolver-driver-did-hedera:v0.1.7-8ae3a53",
      repo: "https://github.com/hiero-ledger/identity-collaboration-hub/tree/main/universal-resolver-driver",
    },
    icon: {
      image: "amuyu/driver-did-icon:0.1.3",
      repo: "https://github.com/amuyu/uni-resolver-driver-did-icon",
      hub: "https://hub.docker.com/r/amuyu/driver-did-icon",
    },
    iden3: {
      image: "ghcr.io/iden3/driver-did-iden3:v1.0.6",
      repo: "https://github.com/iden3/driver-did-iden3",
      hub: "https://github.com/iden3/driver-did-iden3/pkgs/container/driver-did-iden3",
    },
    iid: {
      image: "zoeyian/driver-did-iid:latest",
      repo: "https://github.com/InspurIndustrialInternet/uni-resolver-driver-did-iid",
      hub: "https://hub.docker.com/repository/docker/zoeyian/driver-did-iid",
    },
    indy: {
      image: "universalresolver/driver-did-indy:latest",
      repo: "https://github.com/decentralized-identity/uni-resolver-driver-did-indy",
      hub: "https://hub.docker.com/r/universalresolver/driver-did-indy",
    },
    io: {
      image: "iotex/uni-resolver-driver-did-io:latest",
      repo: "https://github.com/iotexproject/uni-resolver-driver-did-io",
      hub: "https://hub.docker.com/r/iotex/uni-resolver-driver-did-io",
    },
    ion: {
      image: "identityfoundation/driver-did-ion:v0.8.1",
      repo: "https://github.com/decentralized-identity/uni-resolver-driver-did-ion",
      hub: "https://hub.docker.com/r/identityfoundation/driver-did-ion",
    },
    iscc: {
      image: "ghcr.io/iscc/iscc-did-driver:main",
      repo: "https://github.com/iscc/iscc-did-driver",
      hub: "https://github.com/iscc/iscc-did-driver/pkgs/container/iscc-did-driver",
    },
    jolo: {
      image: "jolocomgmbh/jolocom-did-driver:latest",
      repo: "https://github.com/jolocom/jolo-did-method",
      hub: "https://hub.docker.com/r/jolocomgmbh/jolocom-did-driver",
    },
    jwk: {
      image: "transmute/restricted-resolver:latest",
      repo: "https://github.com/transmute-industries/restricted-resolver",
      hub: "https://hub.docker.com/repository/docker/transmute/restricted-resolver",
    },
    keri: {
      image: "gleif/did-webs-resolver-service:0.2.7",
      repo: "https://github.com/GLEIF-IT/did-webs-resolver",
      hub: "https://hub.docker.com/r/gleif/did-keri-resolver",
    },
    key: {
      image: "universalresolver/driver-did-key:latest",
      repo: "https://github.com/decentralized-identity/uni-resolver-driver-did-key",
      hub: "https://hub.docker.com/r/universalresolver/driver-did-key",
    },
    kilt: {
      image: "kiltprotocol/kilt-did-driver:3.0.0",
      repo: "https://github.com/KILTprotocol/kilt-did-driver",
      hub: "https://hub.docker.com/r/kiltprotocol/kilt-did-driver",
    },
    kit: {
      image: "ghcr.io/spruceid/didkit-http:202402050910243f0642d",
      repo: "https://github.com/spruceid/ssi/tree/main/did-tezos/",
      hub: "https://github.com/orgs/spruceid/packages/container/package/didkit-http",
    },
    kscirc: {
      image: "k4security/kschain-resolver:v1.0.1",
      repo: "https://github.com/siera5466/uni-resolver-driver-did-kscirc/tree/main",
      hub: "https://hub.docker.com/r/k4security/kschain-resolver",
    },
    lit: {
      image: "ibct/driver-did-lit:0.1.1",
      repo: "https://github.com/ibct-dev/lit-resolver",
      hub: "https://hub.docker.com/r/ibct/driver-did-lit",
    },
    meta: {
      repo: "https://github.com/METADIUM/meta-DID/blob/master/doc/DID-method-metadium.md",
      hub: "https://resolver.metadium.com/1.0/identifiers/",
    },
    moncon: {
      repo: "https://github.com/LedgerProject/moncon",
      hub: "https://hub.docker.com/r/camicasii/didresolver-g",
    },
    mydata: {
      image: "igrantio/uni-resolver-driver-did-mydata:1.3",
      repo: "https://github.com/decentralised-dataexchange/mydata-did-driver",
      hub: "https://hub.docker.com/repository/docker/igrantio/uni-resolver-driver-did-mydata",
    },
    nfd: {
      image: "txnlab/did-nfd-resolver:0.1.0",
      repo: "https://github.com/TxnLab/nfd-did",
      hub: "https://hub.docker.com/repository/docker/txnlab/did-nfd-resolver",
    },
    ont: {
      image: "ontio/ontid-driver:latest",
      repo: "https://github.com/ontio/ontid-driver",
      hub: "https://hub.docker.com/r/ontio/ontid-driver",
    },
    orb: {
      image:
        "ghcr.io/trustbloc-cicd/orb-did-driver:v1.0.0-rc4-snapshot-7125f6a",
      repo: "https://github.com/trustbloc/orb/releases/tag/v1.0.0-rc3",
      hub: "https://github.com/trustbloc/orb/pkgs/container/orb-did-driver/39284011?tag=v1.0.0-rc3",
    },
    oyd: {
      repo: "https://github.com/OwnYourData/oydid",
      hub: "https://hub.docker.com/r/oydeu/oydid-resolver",
    },
    pdc: {
      image: "w744219971/driver-did-pdc:latest",
      repo: "https://github.com/pdc-community/uni-resolver-driver-did-pdc/blob/master/README.md",
      hub: "https://hub.docker.com/r/w744219971/driver-did-pdc",
    },
    peer: {
      image: "uport/uni-resolver-driver-did-uport:5.0.3",
      repo: "https://github.com/uport-project/uport-did-driver",
      hub: "https://hub.docker.com/r/uport/uni-resolver-driver-did-uport/",
    },
    plc: {
      image: "bnewbold/uni-resolver-driver-did-plc:0.0.1",
      repo: "https://plc.directory",
      hub: "https://hub.docker.com/r/bnewbold/uni-resolver-driver-did-plc",
    },
    prism: {
      image: "ghcr.io/fabiopinheiro/uni-resolver-driver-did-prism:1.1",
      repo: "https://github.com/FabioPinheiro/uni-resolver-driver-did-prism",
      hub: "https://github.com/FabioPinheiro/uni-resolver-driver-did-prism/pkgs/container/uni-resolver-driver-did-prism",
    },
    schema: {
      image: "51nodes/schema-registry-did-resolver:0.1.1",
      repo: "https://github.com/51nodes/schema-registry-did-resolver",
      hub: "https://hub.docker.com/repository/docker/51nodes/schema-registry-did-resolver",
    },
    sol: {
      image: "identitydotcom/driver-did-sol:3.3.0",
      repo: "https://github.com/identity-com/sol-did",
      hub: "https://hub.docker.com/r/identitydotcom/driver-did-sol",
    },
    sov: {
      image: "universalresolver/driver-did-sov:latest",
      repo: "https://github.com/decentralized-identity/uni-resolver-driver-did-sov/",
      hub: "https://hub.docker.com/r/universalresolver/driver-did-sov/",
    },
    stack: {
      image: "universalresolver/driver-did-stack:latest",
      repo: "https://github.com/decentralized-identity/uni-resolver-driver-did-stack/",
      hub: "https://hub.docker.com/r/universalresolver/driver-did-stack/",
    },
    tgrid: {
      image: "trustgrid01/uni-resolver-driver-did-tgrid:v1",
      repo: "https://github.com/tgrid-usa/uni-resolver-driver-did-trustgrid",
      hub: "https://hub.docker.com/r/trustgrid01/uni-resolver-driver-did-tgrid",
    },
    tys: {
      image: "itpeoplecorp/tys-did-driver:latest",
      repo: "https://github.com/itpeople-cy/tys-did-driver/blob/master/README.md",
      hub: "https://hub.docker.com/r/itpeoplecorp/tys-did-driver",
    },
    unisot: {
      image: "unisot/unisot-did-driver:latest",
      repo: "https://gitlab.com/unisot-did/unisot-did-driver",
      hub: "https://hub.docker.com/r/unisot/unisot-did-driver",
    },
    v1: {
      image: "veresone/uni-resolver-did-v1-driver:latest",
      repo: "https://github.com/veres-one/uni-resolver-did-v1-driver",
      hub: "https://hub.docker.com/r/veresone/uni-resolver-did-v1-driver",
    },
    vaa: {
      image: "caictdevelop/driver-did-vaa:1.0.0",
      repo: "https://github.com/caict-develop-zhangbo/uni-resolver-driver-did-vaa",
      hub: "https://hub.docker.com/repository/docker/caictdevelop/driver-did-vaa",
    },
    web: {
      image: "uport/uni-resolver-driver-did-uport:5.0.3",
      repo: "https://github.com/uport-project/uport-did-driver",
      hub: "https://hub.docker.com/r/uport/uni-resolver-driver-did-uport/",
    },
    webplus: {
      image: "ghcr.io/ledgerdomain/did-webplus-urd:v0.1.2",
      repo: "https://github.com/LedgerDomain/did-webplus",
    },
    webs: {
      image: "gleif/did-webs-resolver-service:0.2.7",
      repo: "https://github.com/GLEIF-IT/did-webs-resolver",
      hub: "https://hub.docker.com/r/gleif/did-webs-resolver",
    },
  },
  recommended: [
    {
      id: "cid",
      url: "https://github.com/decentralized-identity/did-methods/blob/main/dif-recommended/findings-did-cid.md",
    },
    {
      id: "ethr",
      url: "https://github.com/decentralized-identity/did-methods/blob/main/dif-recommended/findings-did-ethr.md",
    },
    {
      id: "hedera",
      url: "https://github.com/decentralized-identity/did-methods/blob/main/dif-recommended/findings-did-hedera.md",
    },
    {
      id: "webplus",
      url: "https://github.com/decentralized-identity/did-methods/blob/main/dif-recommended/findings-did-webplus.md",
    },
    {
      id: "webvh",
      url: "https://github.com/decentralized-identity/did-methods/blob/main/dif-recommended/findings-did-webvh.md",
    },
  ],
  endorsed: [],
};

/** Shape/version guard: a corrupt or older stored value must never win. */
export function isValidRegistry(value: unknown): value is DifRegistry {
  const r = value as DifRegistry;
  return (
    !!r &&
    typeof r === "object" &&
    r.v === DIF_REGISTRY_VERSION &&
    typeof r.syncedAt === "number" &&
    Array.isArray(r.composeMethods) &&
    r.composeMethods.length >= 40 &&
    !!r.drivers &&
    typeof r.drivers === "object" &&
    Array.isArray(r.recommended) &&
    Array.isArray(r.endorsed)
  );
}

/** Load the registry: validated stored value, else the vendored fallback. */
export async function loadRegistry(env: Env): Promise<DifRegistry> {
  try {
    const raw = await storeGet(env, DIF_REGISTRY_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidRegistry(parsed)) return parsed;
    }
  } catch {
    // fall through to the snapshot
  }
  return FALLBACK_REGISTRY;
}

/** Run one sync; fail-closed on any anomaly (previous value kept). */
export async function syncRegistry(env: Env, now: number): Promise<void> {
  if (!env.DB) return;
  try {
    const headers = {
      accept: "application/vnd.github+json",
      "user-agent": "thisdid-directory",
    };
    const [composeRes, appRes, readmeRes, recRes, endRes] = await Promise.all([
      fetch(COMPOSE_URL),
      fetch(APP_YML_URL),
      fetch(README_URL),
      fetch(`${DID_METHODS_CONTENTS}/dif-recommended`, { headers }),
      fetch(`${DID_METHODS_CONTENTS}/dif-endorsed`, { headers }),
    ]);
    if (
      !composeRes.ok ||
      !appRes.ok ||
      !readmeRes.ok ||
      !recRes.ok ||
      !endRes.ok
    ) {
      throw new Error(
        `sync HTTP ${composeRes.status}/${appRes.status}/${readmeRes.status}/${recRes.status}/${endRes.status}`,
      );
    }
    const yaml = await composeRes.text();
    const methods = parseComposeMethods(yaml);
    // Shape-drift guard: the catalog has ~67 methods; a collapse means the
    // file moved or the format changed — keep the previous value.
    if (methods.length < 40) {
      throw new Error(`compose parse collapsed to ${methods.length} methods`);
    }
    const drivers = joinDrivers(
      methods,
      parseServiceMap(await appRes.text()),
      parseServiceImages(yaml),
      parseReadmeDrivers(await readmeRes.text()),
    );
    const registry: DifRegistry = {
      v: DIF_REGISTRY_VERSION,
      syncedAt: now,
      composeMethods: methods,
      drivers,
      recommended: parseFindings((await recRes.json()) as ContentsEntry[]),
      endorsed: parseFindings((await endRes.json()) as ContentsEntry[]),
    };
    await storePut(env, DIF_REGISTRY_KEY, JSON.stringify(registry), now);
  } catch (err) {
    console.error(
      JSON.stringify({ event: "directory.sync_error", error: String(err) }),
    );
  }
}
