/**
 * Live captures from the Empeiria TESTNET (`empe-testnet-2`), taken with
 * plain GET `abci_query` calls (path `/empe.diddoc.Query/DidDocument`)
 * against https://rpc-testnet.empe.io on 24 Aug 2026. The `value` field is
 * the chain's protobuf `QueryGetDidDocumentResponse`, base64, exactly as
 * served.
 */

/** A real testnet DID (from Empeiria's own developer documentation). */
export const EMPE_TESTNET_DID =
  "did:empe:testnet:006308981b61932c5eaae1c39ace8ee3892f4a1f";

/** The `result.response` ABCI envelope for {@link EMPE_TESTNET_DID}. */
export const EMPE_OK_RESPONSE = {
  code: 0,
  log: "",
  info: "",
  index: "0",
  key: null,
  value:
    "CucFCjlkaWQ6ZW1wZTp0ZXN0bmV0OjAwNjMwODk4MWI2MTkzMmM1ZWFhZTFjMzlhY2U4ZWUzODkyZjRhMWYSHGh0dHBzOi8vd3d3LnczLm9yZy9ucy9kaWQvdjEaOWRpZDplbXBlOnRlc3RuZXQ6MDA2MzA4OTgxYjYxOTMyYzVlYWFlMWMzOWFjZThlZTM4OTJmNGExZiLDAQo7ZGlkOmVtcGU6dGVzdG5ldDowMDYzMDg5ODFiNjE5MzJjNWVhYWUxYzM5YWNlOGVlMzg5MmY0YTFmIzASCkpzb25XZWJLZXkaOWRpZDplbXBlOnRlc3RuZXQ6MDA2MzA4OTgxYjYxOTMyYzVlYWFlMWMzOWFjZThlZTM4OTJmNGExZjI9CgJFQxIJc2VjcDI1NmsxGixBL1V1OXV6UDBlVnZSdlVPanRHaVpKcDZiYkpOV3ppNXQvL0xqd1FxbDNhVCLIAQpAZGlkOmVtcGU6dGVzdG5ldDowMDYzMDg5ODFiNjE5MzJjNWVhYWUxYzM5YWNlOGVlMzg5MmY0YTFmI2JhY2t1cBIKSnNvbldlYktleRo5ZGlkOmVtcGU6dGVzdG5ldDowMDYzMDg5ODFiNjE5MzJjNWVhYWUxYzM5YWNlOGVlMzg5MmY0YTFmMj0KAkVDEglzZWNwMjU2azEaLEFqRVUyK1NlREdheHA4Q0dEYm1oTm84eEJyWjhJMTVVTmIyNEgyS1dPSkZPKj0KO2RpZDplbXBlOnRlc3RuZXQ6MDA2MzA4OTgxYjYxOTMyYzVlYWFlMWMzOWFjZThlZTM4OTJmNGExZiMwMj0KO2RpZDplbXBlOnRlc3RuZXQ6MDA2MzA4OTgxYjYxOTMyYzVlYWFlMWMzOWFjZThlZTM4OTJmNGExZiMwQkIKQGRpZDplbXBlOnRlc3RuZXQ6MDA2MzA4OTgxYjYxOTMyYzVlYWFlMWMzOWFjZThlZTM4OTJmNGExZiNiYWNrdXA=",
  proofOps: null,
  height: "11905748",
  codespace: "",
} as const;

/** The consensus not-found answer (an id that names no document). */
export const EMPE_MISS_RESPONSE = {
  code: 6,
  log: "DID Document not found: unknown request",
  info: "",
  index: "0",
  key: null,
  value: null,
  proofOps: null,
  height: "11905748",
  codespace: "sdk",
} as const;
