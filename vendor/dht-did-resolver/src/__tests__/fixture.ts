/**
 * A LIVE Pkarr relay capture (https://relay.pkarr.org, 24 Aug 2026): the
 * signed BEP44 payload for the z-base-32 key below — 64-byte Ed25519
 * signature, 8-byte big-endian sequence number, then the compressed DNS
 * packet. It is a real Mainline record (a Pkarr TLD, not a did:dht
 * document), so it exercises transport, signature verification and DNS
 * parsing; the reconstruction step correctly reports it holds no `_did`
 * root record.
 */

/** The published z-base-32 key the payload below belongs to. */
export const PKARR_LIVE_KEY =
  "o4dksfbqk85ogzdb5osziw6befigbuxmuxkuxq8434q89uj56uyy";

/** The relay's exact response body (156 bytes). */
export const PKARR_LIVE_PAYLOAD = Uint8Array.from([
  125, 82, 68, 95, 204, 177, 6, 48, 220, 190, 198, 110, 158, 97, 19, 131, 209,
  79, 154, 118, 153, 57, 71, 69, 162, 230, 110, 90, 106, 252, 58, 102, 114, 109,
  168, 61, 16, 126, 92, 135, 227, 221, 27, 105, 233, 29, 30, 112, 47, 115, 109,
  198, 75, 144, 24, 18, 189, 51, 101, 191, 229, 94, 76, 14, 0, 6, 58, 191, 156,
  133, 154, 112, 0, 0, 128, 0, 0, 0, 0, 1, 0, 0, 0, 0, 52, 111, 52, 100, 107,
  115, 102, 98, 113, 107, 56, 53, 111, 103, 122, 100, 98, 53, 111, 115, 122,
  105, 119, 54, 98, 101, 102, 105, 103, 98, 117, 120, 109, 117, 120, 107, 117,
  120, 113, 56, 52, 51, 52, 113, 56, 57, 117, 106, 53, 54, 117, 121, 121, 0, 0,
  16, 0, 1, 0, 0, 0, 30, 0, 8, 7, 110, 117, 104, 46, 100, 101, 118,
]);
