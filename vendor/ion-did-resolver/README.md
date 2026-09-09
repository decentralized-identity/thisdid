# @thisdid/ion-did-resolver

did:ion resolver for the DIF
[`did-resolver`](https://github.com/decentralized-identity/did-resolver)
interface. Long-form Sidetree identifiers are verified fully offline — the
suffix and delta hashes are recomputed over the canonicalized create data
before the document is composed. Short-form identifiers need an ION node
resolution endpoint; without one they deliberately report `notConfigured`
(no public ION node exists), so a hosting resolver can fall through to its
upstreams.

```ts
import { Resolver } from "did-resolver";
import { getResolver } from "@thisdid/ion-did-resolver";

const resolver = new Resolver(getResolver());
const result = await resolver.resolve("did:ion:EiA…:eyJ…");
```


## Development

```sh
pnpm install
pnpm run build   # tsc → lib/
pnpm test        # offline suite
```

## Command line

The package ships a standalone resolver command, `thisdid-resolve-ion`, that
needs nothing but Node 20+ — no resolver service, no Worker:

```sh
npx thisdid-resolve-ion did:ion:EiBwLUL07Ku-N8ZBODHk2jV2uCRWO6SyLhGZimHbqiTa3A:eyJkZWx0YSI6eyJwYXRjaGVzIjpbeyJhY3Rpb24iOiJyZXBsYWNlIiwiZG9jdW1lbnQiOnsicHVibGljS2V5cyI6W3siaWQiOiJzaWcta2V5IiwicHVibGljS2V5SndrIjp7ImNydiI6InNlY3AyNTZrMSIsImt0eSI6IkVDIiwieCI6IllzQ2dSdHJNNkczZEEwUEcwOGZIbkNJSXVnMmNuUEpLYlFSdElkSWZrUGMiLCJ5IjoiYllQMnB2OHQtR1pPeDdnRXF4Tml6SlZBUGtOMDBZR2VDRUM5aW9nWGdBMCJ9LCJwdXJwb3NlcyI6WyJhdXRoZW50aWNhdGlvbiIsImFzc2VydGlvbk1ldGhvZCJdLCJ0eXBlIjoiRWNkc2FTZWNwMjU2azFWZXJpZmljYXRpb25LZXkyMDE5In1dLCJzZXJ2aWNlcyI6W3siaWQiOiJzaXRlIiwic2VydmljZUVuZHBvaW50IjoiaHR0cHM6Ly90aGlzZGlkLmNvbSIsInR5cGUiOiJMaW5rZWREb21haW5zIn1dfX1dLCJ1cGRhdGVDb21taXRtZW50IjoiRWlDaHp6MG0wOC1yemFzUnlWOXF2QXdVVEswYnZLVURaWlpjUmhDN0ZvRzdCZyJ9LCJzdWZmaXhEYXRhIjp7ImRlbHRhSGFzaCI6IkVpQnlWREdZRlpLaEtObm1MZ25hdW5LWGIySjVUWFhLSUJ4di1lcFdsV1FEOVEiLCJyZWNvdmVyeUNvbW1pdG1lbnQiOiJFaURtMThmeHIzWVZnTGRxZ0xRcElocDQ2TkZneDVIZ1Y2WTMzbFA5Q2Q5VVhnIn19
# from a checkout: node lib/bin.js <did>
```

It prints the DIF resolution result as JSON on stdout and exits 0 when the
DID resolved, 1 when the resolver reported an error
(`didResolutionMetadata.error`), 2 on a usage or configuration error.
`--version-id <id>` and `--version-time <iso>` are passed through as
resolution options, `--compact` prints single-line JSON, `--help` prints the
full reference. Host options are read from the environment, under the same names the ThisDID
Worker uses, so one `.dev.vars` file drives both:

| Variable | Effect |
| --- | --- |
| `ION_RESOLUTION_ENDPOINT` | ION node resolution endpoint for short-form DIDs (`endpointUrl`; unset: short-form reports `notConfigured`) |
| `ION_TIMEOUT_MS` | per-request bound in ms (`timeoutMs`) |
