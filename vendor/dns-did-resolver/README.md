# @thisdid/dns-did-resolver

A `did:dns` driver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver) interface — a clean-room
implementation of the
[did:dns method specification](https://danubetech.github.io/did-method-dns/) over
**DNS-over-HTTPS**, matching the reference (Java) Universal Resolver driver's behavior:

1. Query URI records at `_key1._did.<domain>`, `_key2._did.<domain>`, … sequentially until a
   name yields no record (bounded by `maxKeys`, default 10).
2. Each record's target must be a `did:key` DID — resolved **deterministically offline** via
   `key-did-resolver` (the only network I/O is the DoH lookup itself).
3. Verification methods are merged into the resolved document with ids rewritten to
   `<did>#keyN` and `controller` set to the input DID; relationship arrays follow the target
   key documents.

Both URI record encodings are handled: presentation format (`100 10 "did:key:…"`) and the
RFC 3597 generic wire format Cloudflare DoH returns for the URI type.

**Exit criteria (vendoring convention):** retired if a maintained TypeScript did:dns driver
appears in the ecosystem (only the Java reference driver exists today).

## Usage

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/dns-did-resolver";

const resolver = new Resolver(getResolver()); // Cloudflare DoH by default
const result = await resolver.resolve("did:dns:danubetech.com");
```

Options: `dohUrl` (default `https://cloudflare-dns.com/dns-query`), `timeoutMs` (default 6000),
`maxKeys` (default 10).

## License

Apache-2.0
