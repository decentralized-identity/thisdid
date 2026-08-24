/**
 * Live captures from IOTA Rebased MAINNET (chain 6364aad5), taken with
 * plain `iota_getObject` JSON-RPC calls against https://api.mainnet.iota.cafe
 * on 24 Aug 2026 — two production Identity objects and the fullnode's
 * consensus answer for an id that names no object. Byte arrays are the
 * on-chain `controlled_value` exactly as served.
 */

/** did:iota of a mainnet Identity holding a service-only document. */
export const IOTA_SERVICE_DID =
  "did:iota:0xb42eed86158e2465c7dc2b35706c23af22ad38508bd7b4037a2b3bb6f42c1fa0";

/** Raw `iota_getObject` result for {@link IOTA_SERVICE_DID}'s object. */
export const IOTA_SERVICE_OBJECT = {
  data: {
    objectId:
      "0xb42eed86158e2465c7dc2b35706c23af22ad38508bd7b4037a2b3bb6f42c1fa0",
    version: "738805223",
    digest: "3BJb2NPjrAeFeS78KWLxSr4kfdA6x1PnAdJDNeVRYket",
    type: "0x84cf5d12de2f9731a89bb519bc0c982a941b319a33abefdd5ed2054ad931de08::identity::Identity",
    content: {
      dataType: "moveObject",
      type: "0x84cf5d12de2f9731a89bb519bc0c982a941b319a33abefdd5ed2054ad931de08::identity::Identity",
      fields: {
        created: "1786711974844",
        deleted: false,
        deleted_did: false,
        did_doc: {
          type: "0x84cf5d12de2f9731a89bb519bc0c982a941b319a33abefdd5ed2054ad931de08::multicontroller::Multicontroller<0x1::option::Option<vector<u8>>>",
          fields: {
            active_proposals: [],
            controlled_value: [
              68, 73, 68, 1, 0, 86, 1, 123, 34, 100, 111, 99, 34, 58, 123, 34,
              105, 100, 34, 58, 34, 100, 105, 100, 58, 48, 58, 48, 34, 44, 34,
              115, 101, 114, 118, 105, 99, 101, 34, 58, 91, 123, 34, 105, 100,
              34, 58, 34, 100, 105, 100, 58, 48, 58, 48, 35, 100, 105, 103, 105,
              116, 97, 108, 45, 99, 104, 101, 99, 107, 98, 111, 111, 107, 34,
              44, 34, 116, 121, 112, 101, 34, 58, 34, 73, 111, 116, 97, 65, 117,
              100, 105, 116, 84, 114, 97, 105, 108, 34, 44, 34, 115, 101, 114,
              118, 105, 99, 101, 69, 110, 100, 112, 111, 105, 110, 116, 34, 58,
              34, 105, 111, 116, 97, 58, 47, 47, 109, 97, 105, 110, 110, 101,
              116, 47, 97, 117, 100, 105, 116, 45, 116, 114, 97, 105, 108, 47,
              48, 120, 100, 48, 56, 56, 97, 98, 54, 53, 51, 101, 49, 97, 52, 48,
              56, 48, 56, 54, 56, 98, 57, 55, 49, 49, 55, 57, 102, 50, 98, 98,
              100, 102, 50, 100, 52, 100, 51, 48, 100, 98, 100, 50, 101, 53, 54,
              52, 52, 52, 53, 102, 100, 102, 50, 50, 101, 50, 51, 51, 49, 57,
              102, 52, 101, 99, 63, 114, 101, 99, 111, 114, 100, 70, 111, 114,
              109, 97, 116, 61, 97, 112, 112, 108, 105, 99, 97, 116, 105, 111,
              110, 37, 50, 70, 118, 110, 100, 46, 100, 108, 116, 45, 99, 104,
              101, 99, 107, 98, 111, 111, 107, 45, 101, 110, 116, 114, 121, 37,
              50, 66, 106, 115, 111, 110, 34, 125, 93, 125, 44, 34, 109, 101,
              116, 97, 34, 58, 123, 34, 99, 114, 101, 97, 116, 101, 100, 34, 58,
              34, 50, 48, 50, 54, 45, 48, 56, 45, 49, 52, 84, 49, 50, 58, 53,
              50, 58, 53, 52, 90, 34, 44, 34, 117, 112, 100, 97, 116, 101, 100,
              34, 58, 34, 50, 48, 50, 54, 45, 48, 56, 45, 49, 52, 84, 49, 50,
              58, 53, 50, 58, 53, 52, 90, 34, 125, 125,
            ],
            controllers: {
              type: "0x2::vec_map::VecMap<0x2::object::ID, u64>",
              fields: {
                contents: [
                  {
                    type: "0x2::vec_map::Entry<0x2::object::ID, u64>",
                    fields: {
                      key: "0x3ac947314a86104391177e37e2d4a4cdd0a922a579a30fdfee2e340de6f83b34",
                      value: "1",
                    },
                  },
                ],
              },
            },
            owner:
              "0xb42eed86158e2465c7dc2b35706c23af22ad38508bd7b4037a2b3bb6f42c1fa0",
            proposals: {
              type: "0x2::object_bag::ObjectBag",
              fields: {
                id: {
                  id: "0xab7c852aa011d62274521d47e55f3f900b022df4da49cba0db56c29aa68b996d",
                },
                size: "0",
              },
            },
            revoked_tokens: {
              type: "0x2::vec_set::VecSet<0x2::object::ID>",
              fields: {
                contents: [],
              },
            },
            threshold: "1",
          },
        },
        id: {
          id: "0xb42eed86158e2465c7dc2b35706c23af22ad38508bd7b4037a2b3bb6f42c1fa0",
        },
        legacy_id: null,
        updated: "1786712119246",
        version: "0",
      },
    },
  },
} as const;

/** did:iota of a mainnet Identity with an Ed25519 JsonWebKey2020 method. */
export const IOTA_VM_DID =
  "did:iota:0x0c6e3b00bfe019452ffee1b5c7f5e6d2e09705cb6a354d22fd853450494a697c";

/** Raw `iota_getObject` result for {@link IOTA_VM_DID}'s object. */
export const IOTA_VM_OBJECT = {
  data: {
    objectId:
      "0x0c6e3b00bfe019452ffee1b5c7f5e6d2e09705cb6a354d22fd853450494a697c",
    version: "755714123",
    digest: "8zbJLS8WhonJ54vfMu8japgyaAqww3ymW4rfzDJ5nJL7",
    type: "0x84cf5d12de2f9731a89bb519bc0c982a941b319a33abefdd5ed2054ad931de08::identity::Identity",
    content: {
      dataType: "moveObject",
      type: "0x84cf5d12de2f9731a89bb519bc0c982a941b319a33abefdd5ed2054ad931de08::identity::Identity",
      fields: {
        created: "1765854236049",
        deleted: false,
        deleted_did: false,
        did_doc: {
          type: "0x84cf5d12de2f9731a89bb519bc0c982a941b319a33abefdd5ed2054ad931de08::multicontroller::Multicontroller<0x1::option::Option<vector<u8>>>",
          fields: {
            active_proposals: [],
            controlled_value: [
              68, 73, 68, 1, 0, 46, 2, 123, 34, 100, 111, 99, 34, 58, 123, 34,
              105, 100, 34, 58, 34, 100, 105, 100, 58, 48, 58, 48, 34, 44, 34,
              118, 101, 114, 105, 102, 105, 99, 97, 116, 105, 111, 110, 77, 101,
              116, 104, 111, 100, 34, 58, 91, 123, 34, 105, 100, 34, 58, 34,
              100, 105, 100, 58, 48, 58, 48, 35, 57, 122, 119, 67, 101, 82, 116,
              80, 110, 98, 119, 74, 79, 120, 107, 87, 71, 53, 49, 121, 111, 80,
              52, 111, 69, 99, 77, 106, 107, 81, 73, 65, 48, 71, 57, 82, 55,
              117, 113, 76, 54, 122, 119, 34, 44, 34, 99, 111, 110, 116, 114,
              111, 108, 108, 101, 114, 34, 58, 34, 100, 105, 100, 58, 48, 58,
              48, 34, 44, 34, 116, 121, 112, 101, 34, 58, 34, 74, 115, 111, 110,
              87, 101, 98, 75, 101, 121, 50, 48, 50, 48, 34, 44, 34, 112, 117,
              98, 108, 105, 99, 75, 101, 121, 74, 119, 107, 34, 58, 123, 34,
              107, 116, 121, 34, 58, 34, 79, 75, 80, 34, 44, 34, 117, 115, 101,
              34, 58, 34, 115, 105, 103, 34, 44, 34, 107, 101, 121, 95, 111,
              112, 115, 34, 58, 91, 34, 118, 101, 114, 105, 102, 121, 34, 44,
              34, 115, 105, 103, 110, 34, 93, 44, 34, 97, 108, 103, 34, 58, 34,
              69, 100, 68, 83, 65, 34, 44, 34, 107, 105, 100, 34, 58, 34, 57,
              122, 119, 67, 101, 82, 116, 80, 110, 98, 119, 74, 79, 120, 107,
              87, 71, 53, 49, 121, 111, 80, 52, 111, 69, 99, 77, 106, 107, 81,
              73, 65, 48, 71, 57, 82, 55, 117, 113, 76, 54, 122, 119, 34, 44,
              34, 99, 114, 118, 34, 58, 34, 69, 100, 50, 53, 53, 49, 57, 34, 44,
              34, 120, 34, 58, 34, 103, 122, 75, 76, 109, 50, 107, 116, 108, 68,
              68, 103, 120, 71, 107, 114, 107, 75, 56, 85, 120, 100, 98, 73,
              111, 77, 106, 88, 78, 97, 113, 117, 114, 53, 88, 90, 108, 113, 54,
              110, 80, 81, 85, 34, 125, 125, 93, 44, 34, 115, 101, 114, 118,
              105, 99, 101, 34, 58, 91, 123, 34, 105, 100, 34, 58, 34, 100, 105,
              100, 58, 48, 58, 48, 35, 100, 111, 109, 97, 105, 110, 95, 108,
              105, 110, 107, 97, 103, 101, 34, 44, 34, 116, 121, 112, 101, 34,
              58, 34, 76, 105, 110, 107, 101, 100, 68, 111, 109, 97, 105, 110,
              115, 34, 44, 34, 115, 101, 114, 118, 105, 99, 101, 69, 110, 100,
              112, 111, 105, 110, 116, 34, 58, 34, 104, 116, 116, 112, 115, 58,
              47, 47, 100, 108, 99, 45, 116, 117, 114, 105, 110, 103, 99, 101,
              114, 116, 115, 46, 116, 117, 114, 105, 110, 103, 115, 112, 97, 99,
              101, 46, 99, 111, 47, 34, 125, 93, 125, 44, 34, 109, 101, 116, 97,
              34, 58, 123, 34, 99, 114, 101, 97, 116, 101, 100, 34, 58, 34, 50,
              48, 50, 53, 45, 49, 50, 45, 49, 54, 84, 48, 51, 58, 48, 51, 58,
              53, 54, 90, 34, 44, 34, 117, 112, 100, 97, 116, 101, 100, 34, 58,
              34, 50, 48, 50, 53, 45, 49, 50, 45, 49, 54, 84, 48, 51, 58, 48,
              51, 58, 53, 54, 90, 34, 125, 125,
            ],
            controllers: {
              type: "0x2::vec_map::VecMap<0x2::object::ID, u64>",
              fields: {
                contents: [
                  {
                    type: "0x2::vec_map::Entry<0x2::object::ID, u64>",
                    fields: {
                      key: "0x72a4e8cdb891d5951b5578fc31fe3cf1d83c78a74ce474d8dfd9279d31a000b5",
                      value: "1",
                    },
                  },
                ],
              },
            },
            owner:
              "0x0c6e3b00bfe019452ffee1b5c7f5e6d2e09705cb6a354d22fd853450494a697c",
            proposals: {
              type: "0x2::object_bag::ObjectBag",
              fields: {
                id: {
                  id: "0x98e1f89a583263532201b66dcdf99ecb0eed2ce546bd82958149952e5f9e25b5",
                },
                size: "0",
              },
            },
            revoked_tokens: {
              type: "0x2::vec_set::VecSet<0x2::object::ID>",
              fields: {
                contents: [],
              },
            },
            threshold: "1",
          },
        },
        id: {
          id: "0x0c6e3b00bfe019452ffee1b5c7f5e6d2e09705cb6a354d22fd853450494a697c",
        },
        legacy_id: null,
        updated: "1787558178225",
        version: "0",
      },
    },
  },
} as const;

/** Raw `iota_getObject` result for an object id that does not exist. */
export const IOTA_NOT_EXISTS = {
  error: {
    code: "notExists",
    object_id:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
  },
} as const;

/** The mainnet chain identifier, read live from the fullnode. */
export const IOTA_MAINNET_CHAIN_ID = "6364aad5";
