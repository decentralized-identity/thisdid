/**
 * Live captures from TzKT (https://api.tzkt.io, 24 Aug 2026): revealed
 * mainnet accounts for each curve prefix — real address/public-key pairs
 * whose BLAKE2b-20 reveal relationship the resolver re-verifies — plus a
 * live unrevealed account and the chain ids read from both networks.
 */

/** Revealed mainnet delegates, one per curve (address + base58check key). */
export const TZ_REVEALED = {
  tz1: {
    address: "tz1S7GgVV4FPEGUVzepKBwx22DyNikdpa4X6",
    publicKey: "edpkvCx5JPPWtb23PhCHBZ62rHVcAXyMDwiBEBKutkSgBY4zZH9cGd",
  },
  tz2: {
    address: "tz2FCNBrERXtaTtNX6iimR1UJ5JSDxvdHM93",
    publicKey: "sppk7cwkTzCPptCSxSTvGNg4uqVcuTbyWooLnJp4yxJNH5DReUGxYvs",
  },
  tz3: {
    address: "tz3bEQoFCZEEfZMskefZ8q8e4eiHH1pssRax",
    publicKey: "p2pk66G3vbHoscNYJdgQU72xSkrCWzoXNnFwroADcRTUtrHDvwnUNyW",
  },
} as const;

/** A live unrevealed account (no public key on chain). */
export const TZ_UNREVEALED = {
  address: "tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU",
  publicKey: null,
  revealed: false,
} as const;

/** A live tz4 (BLS) delegate — postdates the did:tz spec. */
export const TZ4_ADDRESS = "tz4TUryBw8kUQm7ScAtMx6FhBH5WswY1TZrE";

export const TZ_MAINNET_CHAIN_ID = "NetXdQprcVkpaWU";
export const TZ_SHADOWNET_CHAIN_ID = "NetXsqzbfFenSTS";

/** A live mainnet KT1 contract (vested funds contract, block 1). */
export const TZ_KT1_ADDRESS = "KT1QuofAgnsWffHzLA7D78rxytJruGHDe7XG";

/** A second revealed tz1 delegate — same curve, different address. */
export const TZ_SECOND_TZ1 = {
  address: "tz1XNwwM7GLWMS2s5oBHdG5rF2gwUNXjoDpt",
  publicKey: "edpkvJyEsX7qSbsgBs5MrRQTDMDapaRscqsZ1NVQWANtKkGaGbKmAx",
} as const;
