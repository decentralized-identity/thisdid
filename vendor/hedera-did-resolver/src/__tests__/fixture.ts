/** Live-captured fixtures (Hedera testnet mirror node, 2026-08-21).
 * TOPIC_MESSAGES: the raw mirror-node page for the catalog example's HCS
 * topic (3 messages: DIDOwner create, Service update, VerificationMethod
 * update — every signature Ed25519-verified against the DID root key).
 * REFERENCE_DOCUMENT: Archon's resolution of the same DID, captured at
 * the same moment — the driver must reproduce it from the raw messages. */
export const TESTNET_DID =
  "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148";

export const TOPIC_MESSAGES = {
  messages: [
    {
      chunk_info: null,
      consensus_timestamp: "1763479731.095378000",
      message:
        "eyJtZXNzYWdlIjp7InRpbWVzdGFtcCI6IjIwMjUtMTEtMThUMTU6Mjg6NTAuNjI2NzgzWiIsIm9wZXJhdGlvbiI6ImNyZWF0ZSIsImRpZCI6ImRpZDpoZWRlcmE6dGVzdG5ldDp6SGlyTTdvUDYycnpCbXc0b1NiV1pUU2VUTHpiOXpyRFRmUWExY2RNQldDUHBfMC4wLjcyODAxNDgiLCJldmVudCI6ImV5SkVTVVJQZDI1bGNpSTZleUpwWkNJNkltUnBaRHBvWldSbGNtRTZkR1Z6ZEc1bGREcDZTR2x5VFRkdlVEWXljbnBDYlhjMGIxTmlWMXBVVTJWVVRIcGlPWHB5UkZSbVVXRXhZMlJOUWxkRFVIQmZNQzR3TGpjeU9EQXhORGdpTENKMGVYQmxJam9pUldReU5UVXhPVlpsY21sbWFXTmhkR2x2Ymt0bGVUSXdNVGdpTENKamIyNTBjbTlzYkdWeUlqb2laR2xrT21obFpHVnlZVHAwWlhOMGJtVjBPbnBJYVhKTk4yOVFOakp5ZWtKdGR6UnZVMkpYV2xSVFpWUk1lbUk1ZW5KRVZHWlJZVEZqWkUxQ1YwTlFjRjh3TGpBdU56STRNREUwT0NJc0luQjFZbXhwWTB0bGVVSmhjMlUxT0NJNklraHBjazAzYjFBMk1uSjZRbTEzTkc5VFlsZGFWRk5sVkV4NllqbDZja1JVWmxGaE1XTmtUVUpYUTFCd0luMTkifSwic2lnbmF0dXJlIjoiVytWYmFYMjFVY1IvN2R1RWt5S3hhTTlaNjJHemQwcVJyUS9XNGI1WDJjQVhCbm9TMGlqOEs2Z1pNTmRJRmZSWVZXTUFGSmEyN0p5SU5OOUNzaW8vRGc9PSJ9",
      payer_account_id: "0.0.5065521",
      running_hash:
        "myVGdmNCcB+A/TkA1WrD4Fzss27PaHTTfhbcMkUxx6TE3540tac4Dq18Z4cyE+fa",
      running_hash_version: 3,
      sequence_number: 1,
      topic_id: "0.0.7280148",
    },
    {
      chunk_info: null,
      consensus_timestamp: "1763479732.949046000",
      message:
        "eyJtZXNzYWdlIjp7InRpbWVzdGFtcCI6IjIwMjUtMTEtMThUMTU6Mjg6NTIuNDQwMjA1WiIsIm9wZXJhdGlvbiI6InVwZGF0ZSIsImRpZCI6ImRpZDpoZWRlcmE6dGVzdG5ldDp6SGlyTTdvUDYycnpCbXc0b1NiV1pUU2VUTHpiOXpyRFRmUWExY2RNQldDUHBfMC4wLjcyODAxNDgiLCJldmVudCI6ImV5SlRaWEoyYVdObElqcDdJbWxrSWpvaVpHbGtPbWhsWkdWeVlUcDBaWE4wYm1WME9ucElhWEpOTjI5UU5qSnlla0p0ZHpSdlUySlhXbFJUWlZSTWVtSTVlbkpFVkdaUllURmpaRTFDVjBOUWNGOHdMakF1TnpJNE1ERTBPQ056WlhKMmFXTmxMVEVpTENKMGVYQmxJam9pVEdsdWEyVmtSRzl0WVdsdWN5SXNJbk5sY25acFkyVkZibVJ3YjJsdWRDSTZJbWgwZEhCek9pOHZaWGhoYlhCc1pTNWpiMjB2ZG1OekluMTkifSwic2lnbmF0dXJlIjoiVnBaeXFLbHc4aGZTN0R5MDRyMHRQN0JGYm1FU2d2eldJMmlLbEN3NU1DN0VrZVZ0bFVWQ3ZsUEh5aHVybElNNXFSbjdNZERlRVdVV1E5K2tObnd1Q1E9PSJ9",
      payer_account_id: "0.0.5065521",
      running_hash:
        "VdnGnnxLM21L1xHy3s/5gPPumPX7xUu9tD/dhazZt87rbxeJMLYTlV6phS463nyn",
      running_hash_version: 3,
      sequence_number: 2,
      topic_id: "0.0.7280148",
    },
    {
      chunk_info: null,
      consensus_timestamp: "1763479735.304300921",
      message:
        "eyJtZXNzYWdlIjp7InRpbWVzdGFtcCI6IjIwMjUtMTEtMThUMTU6Mjg6NTQuNzM0NDQzWiIsIm9wZXJhdGlvbiI6InVwZGF0ZSIsImRpZCI6ImRpZDpoZWRlcmE6dGVzdG5ldDp6SGlyTTdvUDYycnpCbXc0b1NiV1pUU2VUTHpiOXpyRFRmUWExY2RNQldDUHBfMC4wLjcyODAxNDgiLCJldmVudCI6ImV5SldaWEpwWm1sallYUnBiMjVOWlhSb2IyUWlPbnNpYVdRaU9pSmthV1E2YUdWa1pYSmhPblJsYzNSdVpYUTZla2hwY2swM2IxQTJNbko2UW0xM05HOVRZbGRhVkZObFZFeDZZamw2Y2tSVVpsRmhNV05rVFVKWFExQndYekF1TUM0M01qZ3dNVFE0STJ0bGVTMHhJaXdpZEhsd1pTSTZJa1ZrTWpVMU1UbFdaWEpwWm1sallYUnBiMjVMWlhreU1ERTRJaXdpWTI5dWRISnZiR3hsY2lJNkltUnBaRHBvWldSbGNtRTZkR1Z6ZEc1bGREcDZTR2x5VFRkdlVEWXljbnBDYlhjMGIxTmlWMXBVVTJWVVRIcGlPWHB5UkZSbVVXRXhZMlJOUWxkRFVIQmZNQzR3TGpjeU9EQXhORGdpTENKd2RXSnNhV05MWlhsQ1lYTmxOVGdpT2lJNVdIUmlXRmh6VW5GcFRtRktTbFpEVFVWcU1qSlpSVEZDUTBwck1XMW1USGxyTWpGTVpWUTVjR2xGY2lKOWZRPT0ifSwic2lnbmF0dXJlIjoidTFQSXF1dVVJL1h0TW1UZ29paElGdHlxMjQ5R3dIQmVaSjYxemw3Y1M0U1dDWGYvcjZFZDBOdWVibzBVTVNaWG1pcUVzZEQzTk1vbUhHZjZMQkRaQXc9PSJ9",
      payer_account_id: "0.0.5065521",
      running_hash:
        "wxAalO4Nmbi9DUqBUwwgUbKN//PJ2a0GqzKGyV6t4MgjIKOfz+GUwxA4w0rggDAv",
      running_hash_version: 3,
      sequence_number: 3,
      topic_id: "0.0.7280148",
    },
  ],
  links: {
    next: null,
  },
} as const;

export const REFERENCE_DOCUMENT = {
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1",
    "https://w3id.org/security/suites/ed25519-2018/v1",
  ],
  id: "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148",
  controller:
    "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148",
  verificationMethod: [
    {
      id: "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148#did-root-key",
      controller:
        "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148",
      type: "Ed25519VerificationKey2020",
      publicKeyMultibase: "z6MkwB7Pi3dXNQUetRuW8AUQJYCTAZs1QjTpMRUwSuKCRRBC",
    },
    {
      id: "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148#key-1",
      type: "Ed25519VerificationKey2018",
      controller:
        "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148",
      publicKeyBase58: "9XtbXXsRqiNaJJVCMEj22YE1BCJk1mfLyk21LeT9piEr",
    },
  ],
  service: [
    {
      id: "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148#service-1",
      type: "LinkedDomains",
      serviceEndpoint: "https://example.com/vcs",
    },
  ],
  authentication: [
    "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148#did-root-key",
  ],
  assertionMethod: [
    "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.7280148#did-root-key",
  ],
} as const;
