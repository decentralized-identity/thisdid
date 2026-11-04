import { describe, expect, it } from "vitest";
import {
  isGlobalUnicastAddress,
  isPrivateHost,
  parseIpAddress,
} from "../address-policy.js";

const GLOBAL = [
  "93.184.216.34",
  "8.8.8.8",
  "1.1.1.1",
  "100.63.255.255", // just below shared address space
  "100.128.0.0", // just above it
  "198.17.255.255", // just below benchmarking
  "198.20.0.0", // just above it
  "223.255.255.255", // last unicast address before multicast
  "2001:4860:4860::8888",
  "2606:2800:220:1:248:1893:25c8:1946",
  "2a00:1450:4001:80b::200e",
  "[2606:4700:4700::1111]",
  "::ffff:93.184.216.34", // IPv4-mapped, embedded address global
  "::ffff:5db8:d822", // the same in hextets
  "64:ff9b::5db8:d822", // NAT64 of 93.184.216.34
];

const NOT_GLOBAL = [
  // IPv4 special-purpose
  "0.0.0.0",
  "0.1.2.3",
  "10.0.0.1",
  "100.64.0.1",
  "100.127.255.255",
  "127.0.0.1",
  "127.255.255.254",
  "169.254.169.254",
  "172.16.0.1",
  "172.31.255.255",
  "192.0.0.1",
  "192.0.2.1",
  "192.88.99.1",
  "192.168.1.1",
  "198.18.0.1",
  "198.19.255.255",
  "198.51.100.1",
  "203.0.113.1",
  // multicast, reserved, broadcast
  "224.0.0.1",
  "239.255.255.255",
  "240.0.0.1",
  "255.255.255.255",
  // IPv6 outside 2000::/3
  "::",
  "::1",
  "::0",
  "::127.0.0.1",
  "100::1",
  "64:ff9b:1::1",
  "fc00::1",
  "fd12:3456::1",
  "fe80::1",
  "fe80::1%eth0",
  "fec0::1",
  "ff02::1",
  "[::1]",
  // embedded IPv4 that is itself not global
  "::ffff:127.0.0.1",
  "::ffff:10.0.0.1",
  "::ffff:7f00:1",
  "::ffff:a9fe:a9fe",
  "64:ff9b::7f00:1",
  // special-purpose inside 2000::/3
  "2001::1",
  "2001:2::1",
  "2001:10::1",
  "2001:1f::1",
  "2001:20::1",
  "2001:db8::1",
  "2002:c000:204::1",
  "3fff::1",
  "5f00::1",
  // does not parse
  "1.2.3",
  "999.1.1.1",
  "01.2.3.4",
  "1.2.3.4.5",
  ":::1",
  "2001:db8:::1",
  "2001:db8::1::2",
  "12345::1",
  "not-an-address",
  "",
];

describe("globally routable unicast classification", () => {
  it("accepts global unicast addresses", () => {
    for (const address of GLOBAL)
      expect(isGlobalUnicastAddress(address), address).toBe(true);
  });
  it("refuses every special-purpose, transition, multicast, reserved or unparseable address", () => {
    for (const address of NOT_GLOBAL)
      expect(isGlobalUnicastAddress(address), address).toBe(false);
  });
  it("parses addresses into bytes", () => {
    expect(Array.from(parseIpAddress("192.0.2.1")!.bytes)).toEqual([
      192, 0, 2, 1,
    ]);
    expect(Array.from(parseIpAddress("2001:db8::1")!.bytes)).toEqual([
      0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);
    expect(
      Array.from(parseIpAddress("::ffff:192.0.2.1")!.bytes).slice(10),
    ).toEqual([0xff, 0xff, 192, 0, 2, 1]);
    expect(parseIpAddress("2001:db8:::1")).toBeNull();
  });
});

describe("isPrivateHost", () => {
  it("refuses localhost names, non-global literals and unparseable IP-like literals", () => {
    for (const host of [
      "localhost",
      "LOCALHOST.",
      "app.localhost",
      "127.0.0.1",
      "[::1]",
      "100.64.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "2001:db8::1",
      "1.2.3",
      "999.1.1.1",
    ]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
  });
  it("accepts global literals and leaves names to the connection-level guard", () => {
    for (const host of [
      "93.184.216.34",
      "[2606:4700:4700::1111]",
      "example.com",
      "identity.foundation",
      "localtest.me",
    ]) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });
});
