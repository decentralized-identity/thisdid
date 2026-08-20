/** Live-captured did:cid chain for archon.technology's node identity
 * (18 events, exported 2026-08-19) plus the Gatekeeper's own resolution
 * of it — the driver must independently verify the chain and reproduce
 * the same document and metadata. */
export const ARCHON_NODE_DID =
  "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq";

export const FIXTURE = {
  events: [
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.734Z",
      ordinal: [1779125779734, 14],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      operation: {
        created: "2026-01-27T20:53:49.672Z",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-01-27T20:53:49.675Z",
          verificationMethod: "#key-1",
          proofPurpose: "authentication",
          proofValue:
            "DOYRpYDoqWmdbrD1i4PNrITo4vzQfPUIv1XcAgRkqAEl2-q6ZWGS7OkkDdJ_wW7928uKrIZCRaM0oeDd8L8jAg",
        },
        publicJwk: {
          kty: "EC",
          crv: "secp256k1",
          x: "TrYXD_NHqE9MYwEbkF_1qPqMPlosPGbqvjIyCQHXS0U",
          y: "Abh_no1Mo8avg8p0psNi6BRjkRkRcfECw5Geu8s73YA",
        },
        registration: {
          version: 1,
          type: "agent",
          registry: "hyperswarm",
        },
        type: "create",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.734Z",
      ordinal: [1779125779734, 15],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaierazptze77mzsrrjvjscmfdjxp35374avietdzem6v252pq4g6o4swa",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiDNGU2495SIviXeqVKLUICuy99bsSTIB4_C30Ci38yTig/certhash/uEiCRLhQE3XfkgX36A03RJoITqg1v5nS3llkS5VqHU8jzZQ/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiDnYmE1WAhu-UFPUKHDoOpdZEItwrKZdjCUudgtwoNyGw/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
          },
        },
        previd: "bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-01-27T20:53:51.916Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "ynpqpzYA0hSJwqPLkL2jA3uAEaj-KZjuV0LaDw7JZ-pNiZyaoDBhQAouJX-MIA8Kzr-e_ipmodJ9eEnJe-niDg",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.734Z",
      ordinal: [1779125779734, 16],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaierautf6hnkluwtxdz3q3vb53mlmcpe3w7aoaowjevgxytt4c5phiura",
      operation: {
        type: "update",
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        previd: "bagaaierazptze77mzsrrjvjscmfdjxp35374avietdzem6v252pq4g6o4swa",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiDNGU2495SIviXeqVKLUICuy99bsSTIB4_C30Ci38yTig/certhash/uEiCRLhQE3XfkgX36A03RJoITqg1v5nS3llkS5VqHU8jzZQ/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiASH-HbwQxd8GkASaGrLMOyyZLmAPW8BkWAHct3hC4dTQ/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
          },
        },
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-01-28T15:26:29.575Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "DbzdlDwxKmtlXMXSPGAvh_OW6M3KMptJCsiUOsp96bImxRhcVcAc9gJSQ5wlxgPXr3zmBIlsj-bSLUYZqmxhTQ",
        },
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.734Z",
      ordinal: [1779125779734, 18],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaierajaxgnjng72opyx7flp3emtn2vw4zsowsrexyoy5du5tg7p3vo7ja",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [],
              },
            },
          },
        },
        previd: "bagaaierautf6hnkluwtxdz3q3vb53mlmcpe3w7aoaowjevgxytt4c5phiura",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-01-28T16:56:21.253Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "rap1FztjhV7WJYH4TcLFue4h-dW-4nbkqwqxipbC6h80KeIBs4i9M-hmX3_DYadCVJM3FEt7FTvGQGnQDlrrpQ",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.734Z",
      ordinal: [1779125779734, 25],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaierasj7qfck4b2ve2igamccdcy53bixzqs2uwyvsxxygpm3zfdb7wina",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [],
              },
            },
          },
        },
        previd: "bagaaierajaxgnjng72opyx7flp3emtn2vw4zsowsrexyoy5du5tg7p3vo7ja",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-01-28T20:55:00.429Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "c2wejGeNwEoBWkdIQxgxRqaa0t-6e2nvijX7TWeF5_9dVM4Jd6LCD4fvOEc1GEQAafBXPBzR_NsglHr9rm0OUA",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.734Z",
      ordinal: [1779125779734, 26],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaieragy3f6m4jqzrth7cegdlvg55yhygnqssaidlc7bc6qpdhxvq6snda",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [],
              },
            },
          },
        },
        previd: "bagaaierasj7qfck4b2ve2igamccdcy53bixzqs2uwyvsxxygpm3zfdb7wina",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-01-28T20:56:09.929Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "H2lj0idyioobwHlct68Dt4gncswwzNKluMRSfdIWmoZzC6LFHPlCbHN6f5cffpjiu53QIiJdDbel5GppAqBzwg",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.734Z",
      ordinal: [1779125779734, 27],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaieralollpkkhqhm3k2syozfl4riadvklvwlwq3b7hbrsn36u4qqt2anq",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [],
              },
            },
          },
        },
        previd: "bagaaieragy3f6m4jqzrth7cegdlvg55yhygnqssaidlc7bc6qpdhxvq6snda",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-01-28T21:07:40.213Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "vLQ8QEZeP0kO0vhKtpV8J95gpsgzrGCHjG1BKDX02-8vNTM72JSDY4zB0Lk0qCjrPb3hdSbwAMHs-sRl7EQBBw",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.734Z",
      ordinal: [1779125779734, 30],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaierahctk6lkflwixus3ilu5tmvjbez6k6x3yszgjxizdhj7jl3u6444a",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [],
              },
            },
          },
        },
        previd: "bagaaieralollpkkhqhm3k2syozfl4riadvklvwlwq3b7hbrsn36u4qqt2anq",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-01-30T19:39:47.911Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "1m_qCE9Ya65L9JZO3PEcGYQkc9UfX_tMdEkL9DNZ6chif4Wkf1JV-lufAVQ9-S847HiAQfVSkO46Ra3BIDDlqg",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.734Z",
      ordinal: [1779125779734, 46],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaierakix5mua3lnkdrbslsj7cwstj3ty66l6fjpdkkt72tedh3ong4pna",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiDNGU2495SIviXeqVKLUICuy99bsSTIB4_C30Ci38yTig/certhash/uEiCRLhQE3XfkgX36A03RJoITqg1v5nS3llkS5VqHU8jzZQ/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiDrb66xRV2qUz5saFM9klNEafsJs_otrBEqI4sr15P_ug/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
          },
        },
        previd: "bagaaierahctk6lkflwixus3ilu5tmvjbez6k6x3yszgjxizdhj7jl3u6444a",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-02-03T02:52:02.739Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "xez8a0KUY0Tbq6LcbdGaDyE6_so6-edoEwdQPZbL4xssVjOxRkImkfKQjW5d-ejDguACPrEcSAWBnzQ00j4TCg",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.750Z",
      ordinal: [1779125779750, 48],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaieramnzrsjeldhl4mkiwuaibsclzf7vpreuyi63q5ay3cy65daduc3oa",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiCRLhQE3XfkgX36A03RJoITqg1v5nS3llkS5VqHU8jzZQ/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiAIFll0X87Bfp1ys3XUzMftG1dAWENdPbbRSXkCrTUAZg/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
          },
        },
        previd: "bagaaierakix5mua3lnkdrbslsj7cwstj3ty66l6fjpdkkt72tedh3ong4pna",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-02-06T18:11:36.456Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "sfl3gqBUzwknM1tY4KNN4B6KNVKnb1fleho7Ur4Kwu0bgYZ08Q8lEZCAmAMKmKVUph41sFIhj2jNm600AJMi4g",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.750Z",
      ordinal: [1779125779750, 49],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaieradev2igajn2yg55ss3glejezweqxkheaa27uzitmhvkk5xalxkeia",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiCRLhQE3XfkgX36A03RJoITqg1v5nS3llkS5VqHU8jzZQ/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiC8gvWMo63F2Kakzw5R6Jz12QdmNNSjXUfdQzm4SexNTA/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
          },
        },
        previd: "bagaaieramnzrsjeldhl4mkiwuaibsclzf7vpreuyi63q5ay3cy65daduc3oa",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-02-06T18:14:04.573Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "K8ifI5qYK8-tEQiIx8tVqHxX1uZwAgQWxXtycDQnVLd3iO60jeRjrZgLEfWSJJfqhyi7G1pLukYq-YB2zXztYA",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.750Z",
      ordinal: [1779125779750, 91],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaierattvpsuj2d3doqiu2edeytyyjislfathny2hid5eb7brh2ov4a23a",
      operation: {
        type: "update",
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        previd: "bagaaieradev2igajn2yg55ss3glejezweqxkheaa27uzitmhvkk5xalxkeia",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/tcp/8081/ws/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiCRLhQE3XfkgX36A03RJoITqg1v5nS3llkS5VqHU8jzZQ/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiChtaas_G64ifpIlH0btCY2WwmV7M8G3bpyXRyk_x045A/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
          },
        },
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-02-17T18:28:42.734Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "Jn57WPWn7EzpKf_uLkG-bJxlPTnOGzDH-6TBhjCEeL8mGslB6vx9yZCLpVGa96rk_D5_gGDEAkmKalBSPIKnNA",
        },
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.766Z",
      ordinal: [1779125779766, 1],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaierabgmhk72u7nh7rdwiwcelveo6wqbmwdol4ytfp4szey2kgiq2zujq",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/tcp/8081/ws/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/11518/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/11518/quic-v1/webtransport/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/certhash/uEiBH96GQL_3yVRgL6WGzfSFRtMC39PQ980jqxPN_eNK9Mw/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/11518/webrtc-direct/certhash/uEiAYj5JlGKXM42mIaZJiMltwZUdpvNtXccNZ3V85irAnfQ/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/certhash/uEiBH96GQL_3yVRgL6WGzfSFRtMC39PQ980jqxPN_eNK9Mw/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiAYj5JlGKXM42mIaZJiMltwZUdpvNtXccNZ3V85irAnfQ/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
          },
        },
        previd: "bagaaierattvpsuj2d3doqiu2edeytyyjislfathny2hid5eb7brh2ov4a23a",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-02-20T20:26:56.986Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "MUd-C7eHl7G9JwXvzQnThBx1Y7WTuKos_Q564dlfXVUqw62jJxgAF2b3UhkF4HUnji45MDNKTNNqOjC1ftOVTA",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.766Z",
      ordinal: [1779125779766, 27],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaiera74vwsf5ezpxapsdds6ceoqunu77sw2o4kka3wpxtzniiy272junq",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/tcp/8081/ws/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/certhash/uEiBH96GQL_3yVRgL6WGzfSFRtMC39PQ980jqxPN_eNK9Mw/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiDxhpJyB-_RZ-4d90bWuQVGHQT7Em1RWWRyncd4ZHz-mg/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
          },
        },
        previd: "bagaaierabgmhk72u7nh7rdwiwcelveo6wqbmwdol4ytfp4szey2kgiq2zujq",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-02-21T05:42:01.797Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "71wSUplRaa3pGejXwbC0lXFBZlY5bUUE8Na1lHAbZVo3qTGyJOY8WVtxcaE8K-2IkaDF-Yeg8PlZE3vx_YlayA",
        },
        type: "update",
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.766Z",
      ordinal: [1779125779766, 57],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaieraorq6pb2pzqwm7m6qfoh47e2wgtjgw6czhgtiqikqv5otimahom6q",
      operation: {
        type: "update",
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        previd: "bagaaiera74vwsf5ezpxapsdds6ceoqunu77sw2o4kka3wpxtzniiy272junq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/tcp/8081/ws/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/certhash/uEiBH96GQL_3yVRgL6WGzfSFRtMC39PQ980jqxPN_eNK9Mw/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiDxhpJyB-_RZ-4d90bWuQVGHQT7Em1RWWRyncd4ZHz-mg/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
            backupStore:
              "did:cid:bagaaieraro6fe2f3kxy2bavzljjrerp6547hpuuuxjh2cv4n5frb643quptq",
          },
        },
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-02-24T16:42:29.408Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "4AJgHK2YT7uPSqpqJjDbMHzPutq3Odc5z8MIgRpthHkdL4b9Fx0MRPLsWMWQh5ed3on2kP68ePEKSoo7-ugQCw",
        },
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.766Z",
      ordinal: [1779125779766, 58],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaiera7g3vadeej62xikusw6efzmvv2dakblihsiqab52zedzoe564z7ea",
      operation: {
        type: "update",
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        previd: "bagaaieraorq6pb2pzqwm7m6qfoh47e2wgtjgw6czhgtiqikqv5otimahom6q",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/tcp/8081/ws/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/certhash/uEiBH96GQL_3yVRgL6WGzfSFRtMC39PQ980jqxPN_eNK9Mw/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiDxhpJyB-_RZ-4d90bWuQVGHQT7Em1RWWRyncd4ZHz-mg/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
            backupStore:
              "did:cid:bagaaiera7yru46ij2x3vbuhbek5v23vmcj2bcd3der56aftb2zzvm66moykq",
          },
        },
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-02-24T16:45:32.819Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "WOebQLmnfeilNzWtfewX9IGVB1YqT2m2dNiROF0I0_gVomswlq6ptIhEDDjUKJjjBcWUVtUYpF7dXDemanOolg",
        },
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.766Z",
      ordinal: [1779125779766, 59],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaieraew2athgp63fezjutnuyjpjwaizu5znrpinmm6le5oavz6fwhxkoq",
      operation: {
        type: "update",
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        previd: "bagaaiera7g3vadeej62xikusw6efzmvv2dakblihsiqab52zedzoe564z7ea",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/tcp/8081/ws/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/certhash/uEiBH96GQL_3yVRgL6WGzfSFRtMC39PQ980jqxPN_eNK9Mw/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiDxhpJyB-_RZ-4d90bWuQVGHQT7Em1RWWRyncd4ZHz-mg/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
            backupStore:
              "did:cid:bagaaiera7yru46ij2x3vbuhbek5v23vmcj2bcd3der56aftb2zzvm66moykq",
            URL: "https://archon.technology",
          },
        },
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-02-24T16:46:49.934Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "eAXi4YpDxhwfywG7oGSTSILPZJT9ogF1NztFTz7hpph9PhqTycVrpbCYs_FosnIbsjEh9v20hzL6Thfl7o5oKQ",
        },
      },
    },
    {
      registry: "hyperswarm",
      time: "2026-05-18T17:36:19.766Z",
      ordinal: [1779125779766, 71],
      did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      opid: "bagaaieraaq75psozcfsftb5tnsvpgvvfmpxxhvh2bjdjfxwph6uk2pnaoodq",
      operation: {
        did: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
        doc: {
          didDocumentData: {
            node: {
              name: "flaxscrip:perceval",
              ipfs: {
                id: "12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                addresses: [
                  "/ip4/74.208.222.204/tcp/23912/ws/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/tcp/4001/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/tcp/50758/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/1744/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/1744/quic-v1/webtransport/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/certhash/uEiBH96GQL_3yVRgL6WGzfSFRtMC39PQ980jqxPN_eNK9Mw/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/1744/webrtc-direct/certhash/uEiCtFCDTLOMjMihVRVQEEBOHTjP3kg7nztvobjxMUemkXQ/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/quic-v1/webtransport/certhash/uEiDRavKPJT_aRizpl_YqfHigcI8Hl6g0qkB4aHWu-umnuA/certhash/uEiBH96GQL_3yVRgL6WGzfSFRtMC39PQ980jqxPN_eNK9Mw/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                  "/ip4/74.208.222.204/udp/4001/webrtc-direct/certhash/uEiCtFCDTLOMjMihVRVQEEBOHTjP3kg7nztvobjxMUemkXQ/p2p/12D3KooWNp7hjDqHzACMPgm2zyQiHKAG4fN2TUbm6uAobWbqDSTc",
                ],
              },
            },
            backupStore:
              "did:cid:bagaaiera7yru46ij2x3vbuhbek5v23vmcj2bcd3der56aftb2zzvm66moykq",
            URL: "https://archon.technology",
          },
        },
        previd: "bagaaieraew2athgp63fezjutnuyjpjwaizu5znrpinmm6le5oavz6fwhxkoq",
        proof: {
          type: "EcdsaSecp256k1Signature2019",
          created: "2026-02-27T21:40:49.440Z",
          verificationMethod:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq#key-1",
          proofPurpose: "authentication",
          proofValue:
            "YJgzap-nPJe78wvhHTdmxyxZQePMWz4tuQr4RuNYeTxdbw1bmFGcitEZSQmhshXWisjnUsay3AqR0-uWcw8Kfw",
        },
        type: "update",
      },
    },
  ],
  expected: {
    didDocument: {
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
      verificationMethod: [
        {
          id: "#key-1",
          controller:
            "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq",
          type: "EcdsaSecp256k1VerificationKey2019",
          publicKeyJwk: {
            kty: "EC",
            crv: "secp256k1",
            x: "TrYXD_NHqE9MYwEbkF_1qPqMPlosPGbqvjIyCQHXS0U",
            y: "Abh_no1Mo8avg8p0psNi6BRjkRkRcfECw5Geu8s73YA",
          },
        },
      ],
      authentication: ["#key-1"],
      assertionMethod: ["#key-1"],
    },
    didDocumentMetadata: {
      created: "2026-01-27T20:53:49Z",
      updated: "2026-05-18T17:36:19Z",
      versionId:
        "bagaaieraaq75psozcfsftb5tnsvpgvvfmpxxhvh2bjdjfxwph6uk2pnaoodq",
      versionSequence: "18",
      confirmed: true,
    },
  },
} as const;
