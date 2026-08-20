/** Reference-resolver captures (dev.uniresolver.io, 2026-08-20).
 * LONG_FORM: a long-form DID constructed with this package's exact
 * JCS + multihash algorithm and resolution-verified on the reference
 * implementation — the driver must reproduce this document offline.
 * SHORT_FORM: the published spec-example DID as served by the live
 * ION mainnet node behind the DIF resolver. */
export const LONG_FORM_DID =
  "did:ion:EiBwLUL07Ku-N8ZBODHk2jV2uCRWO6SyLhGZimHbqiTa3A:eyJkZWx0YSI6eyJwYXRjaGVzIjpbeyJhY3Rpb24iOiJyZXBsYWNlIiwiZG9jdW1lbnQiOnsicHVibGljS2V5cyI6W3siaWQiOiJzaWcta2V5IiwicHVibGljS2V5SndrIjp7ImNydiI6InNlY3AyNTZrMSIsImt0eSI6IkVDIiwieCI6IllzQ2dSdHJNNkczZEEwUEcwOGZIbkNJSXVnMmNuUEpLYlFSdElkSWZrUGMiLCJ5IjoiYllQMnB2OHQtR1pPeDdnRXF4Tml6SlZBUGtOMDBZR2VDRUM5aW9nWGdBMCJ9LCJwdXJwb3NlcyI6WyJhdXRoZW50aWNhdGlvbiIsImFzc2VydGlvbk1ldGhvZCJdLCJ0eXBlIjoiRWNkc2FTZWNwMjU2azFWZXJpZmljYXRpb25LZXkyMDE5In1dLCJzZXJ2aWNlcyI6W3siaWQiOiJzaXRlIiwic2VydmljZUVuZHBvaW50IjoiaHR0cHM6Ly90aGlzZGlkLmNvbSIsInR5cGUiOiJMaW5rZWREb21haW5zIn1dfX1dLCJ1cGRhdGVDb21taXRtZW50IjoiRWlDaHp6MG0wOC1yemFzUnlWOXF2QXdVVEswYnZLVURaWlpjUmhDN0ZvRzdCZyJ9LCJzdWZmaXhEYXRhIjp7ImRlbHRhSGFzaCI6IkVpQnlWREdZRlpLaEtObm1MZ25hdW5LWGIySjVUWFhLSUJ4di1lcFdsV1FEOVEiLCJyZWNvdmVyeUNvbW1pdG1lbnQiOiJFaURtMThmeHIzWVZnTGRxZ0xRcElocDQ2TkZneDVIZ1Y2WTMzbFA5Q2Q5VVhnIn19";

export const SHORT_FORM_DID =
  "did:ion:EiClkZMDxPKqC9c-umQfTkR8vvZ9JPhl_xLDI9Nfk38w5w";

export const LONG_FORM_EXPECTED = {
  didDocument: {
    id: "did:ion:EiBwLUL07Ku-N8ZBODHk2jV2uCRWO6SyLhGZimHbqiTa3A:eyJkZWx0YSI6eyJwYXRjaGVzIjpbeyJhY3Rpb24iOiJyZXBsYWNlIiwiZG9jdW1lbnQiOnsicHVibGljS2V5cyI6W3siaWQiOiJzaWcta2V5IiwicHVibGljS2V5SndrIjp7ImNydiI6InNlY3AyNTZrMSIsImt0eSI6IkVDIiwieCI6IllzQ2dSdHJNNkczZEEwUEcwOGZIbkNJSXVnMmNuUEpLYlFSdElkSWZrUGMiLCJ5IjoiYllQMnB2OHQtR1pPeDdnRXF4Tml6SlZBUGtOMDBZR2VDRUM5aW9nWGdBMCJ9LCJwdXJwb3NlcyI6WyJhdXRoZW50aWNhdGlvbiIsImFzc2VydGlvbk1ldGhvZCJdLCJ0eXBlIjoiRWNkc2FTZWNwMjU2azFWZXJpZmljYXRpb25LZXkyMDE5In1dLCJzZXJ2aWNlcyI6W3siaWQiOiJzaXRlIiwic2VydmljZUVuZHBvaW50IjoiaHR0cHM6Ly90aGlzZGlkLmNvbSIsInR5cGUiOiJMaW5rZWREb21haW5zIn1dfX1dLCJ1cGRhdGVDb21taXRtZW50IjoiRWlDaHp6MG0wOC1yemFzUnlWOXF2QXdVVEswYnZLVURaWlpjUmhDN0ZvRzdCZyJ9LCJzdWZmaXhEYXRhIjp7ImRlbHRhSGFzaCI6IkVpQnlWREdZRlpLaEtObm1MZ25hdW5LWGIySjVUWFhLSUJ4di1lcFdsV1FEOVEiLCJyZWNvdmVyeUNvbW1pdG1lbnQiOiJFaURtMThmeHIzWVZnTGRxZ0xRcElocDQ2TkZneDVIZ1Y2WTMzbFA5Q2Q5VVhnIn19",
    "@context": [
      "https://www.w3.org/ns/did/v1",
      {
        "@base":
          "did:ion:EiBwLUL07Ku-N8ZBODHk2jV2uCRWO6SyLhGZimHbqiTa3A:eyJkZWx0YSI6eyJwYXRjaGVzIjpbeyJhY3Rpb24iOiJyZXBsYWNlIiwiZG9jdW1lbnQiOnsicHVibGljS2V5cyI6W3siaWQiOiJzaWcta2V5IiwicHVibGljS2V5SndrIjp7ImNydiI6InNlY3AyNTZrMSIsImt0eSI6IkVDIiwieCI6IllzQ2dSdHJNNkczZEEwUEcwOGZIbkNJSXVnMmNuUEpLYlFSdElkSWZrUGMiLCJ5IjoiYllQMnB2OHQtR1pPeDdnRXF4Tml6SlZBUGtOMDBZR2VDRUM5aW9nWGdBMCJ9LCJwdXJwb3NlcyI6WyJhdXRoZW50aWNhdGlvbiIsImFzc2VydGlvbk1ldGhvZCJdLCJ0eXBlIjoiRWNkc2FTZWNwMjU2azFWZXJpZmljYXRpb25LZXkyMDE5In1dLCJzZXJ2aWNlcyI6W3siaWQiOiJzaXRlIiwic2VydmljZUVuZHBvaW50IjoiaHR0cHM6Ly90aGlzZGlkLmNvbSIsInR5cGUiOiJMaW5rZWREb21haW5zIn1dfX1dLCJ1cGRhdGVDb21taXRtZW50IjoiRWlDaHp6MG0wOC1yemFzUnlWOXF2QXdVVEswYnZLVURaWlpjUmhDN0ZvRzdCZyJ9LCJzdWZmaXhEYXRhIjp7ImRlbHRhSGFzaCI6IkVpQnlWREdZRlpLaEtObm1MZ25hdW5LWGIySjVUWFhLSUJ4di1lcFdsV1FEOVEiLCJyZWNvdmVyeUNvbW1pdG1lbnQiOiJFaURtMThmeHIzWVZnTGRxZ0xRcElocDQ2TkZneDVIZ1Y2WTMzbFA5Q2Q5VVhnIn19",
      },
    ],
    service: [
      {
        id: "#site",
        type: "LinkedDomains",
        serviceEndpoint: "https://thisdid.com",
      },
    ],
    verificationMethod: [
      {
        id: "#sig-key",
        controller:
          "did:ion:EiBwLUL07Ku-N8ZBODHk2jV2uCRWO6SyLhGZimHbqiTa3A:eyJkZWx0YSI6eyJwYXRjaGVzIjpbeyJhY3Rpb24iOiJyZXBsYWNlIiwiZG9jdW1lbnQiOnsicHVibGljS2V5cyI6W3siaWQiOiJzaWcta2V5IiwicHVibGljS2V5SndrIjp7ImNydiI6InNlY3AyNTZrMSIsImt0eSI6IkVDIiwieCI6IllzQ2dSdHJNNkczZEEwUEcwOGZIbkNJSXVnMmNuUEpLYlFSdElkSWZrUGMiLCJ5IjoiYllQMnB2OHQtR1pPeDdnRXF4Tml6SlZBUGtOMDBZR2VDRUM5aW9nWGdBMCJ9LCJwdXJwb3NlcyI6WyJhdXRoZW50aWNhdGlvbiIsImFzc2VydGlvbk1ldGhvZCJdLCJ0eXBlIjoiRWNkc2FTZWNwMjU2azFWZXJpZmljYXRpb25LZXkyMDE5In1dLCJzZXJ2aWNlcyI6W3siaWQiOiJzaXRlIiwic2VydmljZUVuZHBvaW50IjoiaHR0cHM6Ly90aGlzZGlkLmNvbSIsInR5cGUiOiJMaW5rZWREb21haW5zIn1dfX1dLCJ1cGRhdGVDb21taXRtZW50IjoiRWlDaHp6MG0wOC1yemFzUnlWOXF2QXdVVEswYnZLVURaWlpjUmhDN0ZvRzdCZyJ9LCJzdWZmaXhEYXRhIjp7ImRlbHRhSGFzaCI6IkVpQnlWREdZRlpLaEtObm1MZ25hdW5LWGIySjVUWFhLSUJ4di1lcFdsV1FEOVEiLCJyZWNvdmVyeUNvbW1pdG1lbnQiOiJFaURtMThmeHIzWVZnTGRxZ0xRcElocDQ2TkZneDVIZ1Y2WTMzbFA5Q2Q5VVhnIn19",
        type: "EcdsaSecp256k1VerificationKey2019",
        publicKeyJwk: {
          crv: "secp256k1",
          kty: "EC",
          x: "YsCgRtrM6G3dA0PG08fHnCIIug2cnPJKbQRtIdIfkPc",
          y: "bYP2pv8t-GZOx7gEqxNizJVAPkN00YGeCEC9iogXgA0",
        },
      },
    ],
    authentication: ["#sig-key"],
    assertionMethod: ["#sig-key"],
  },
  didDocumentMetadata: {
    method: {
      published: false,
      recoveryCommitment: "EiDm18fxr3YVgLdqgLQpIhp46NFgx5HgV6Y33lP9Cd9UXg",
      updateCommitment: "EiChzz0m08-rzasRyV9qvAwUTK0bvKUDZZZcRhC7FoG7Bg",
    },
    equivalentId: ["did:ion:EiBwLUL07Ku-N8ZBODHk2jV2uCRWO6SyLhGZimHbqiTa3A"],
  },
} as const;

export const SHORT_FORM_UPSTREAM = {
  didDocument: {
    id: "did:ion:EiClkZMDxPKqC9c-umQfTkR8vvZ9JPhl_xLDI9Nfk38w5w",
    "@context": [
      "https://www.w3.org/ns/did/v1",
      {
        "@base": "did:ion:EiClkZMDxPKqC9c-umQfTkR8vvZ9JPhl_xLDI9Nfk38w5w",
      },
    ],
    service: [
      {
        id: "#linkedin",
        type: "linkedin",
        serviceEndpoint: "linkedin.com/in/henry-tsai-6b884014",
      },
      {
        id: "#github",
        type: "github",
        serviceEndpoint: "github.com/thehenrytsai",
      },
    ],
    verificationMethod: [
      {
        id: "#someKeyId",
        controller: "did:ion:EiClkZMDxPKqC9c-umQfTkR8vvZ9JPhl_xLDI9Nfk38w5w",
        type: "EcdsaSecp256k1VerificationKey2019",
        publicKeyJwk: {
          kty: "EC",
          crv: "secp256k1",
          x: "WfY7Px6AgH6x-_dgAoRbg8weYRJA36ON-gQiFnETrqw",
          y: "IzFx3BUGztK0cyDStiunXbrZYYTtKbOUzx16SUK0sAY",
        },
      },
    ],
    authentication: ["#someKeyId"],
  },
  didDocumentMetadata: {
    method: {
      published: true,
      recoveryCommitment: "EiDKYXZ2MkHRCYDVtXI7ONiTkTdVfs9Tnb-tDDHGXLzmOw",
      updateCommitment: "EiDNk40DUvxCef8_BinU5DDIAhNWE4e7Ea9Q6P7GAbJ6VA",
    },
    canonicalId: "did:ion:EiClkZMDxPKqC9c-umQfTkR8vvZ9JPhl_xLDI9Nfk38w5w",
  },
  didResolutionMetadata: {},
} as const;
