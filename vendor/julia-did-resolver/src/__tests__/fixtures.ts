/**
 * Shared test fixtures — the same recordings the Python reference suite
 * replays, so the two implementations are proved byte-equivalent against one
 * source of truth rather than against each other's descriptions.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FullNodeClient, type RpcTransport } from "../chain.js";

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = join(here, "fixtures");
/** The repository's canonical fixture directory, when this package is not vendored. */
export const CANONICAL_FIXTURE_DIR = join(
  here,
  "..",
  "..",
  "..",
  "tests",
  "fixtures",
);

export function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

export function loadFixture<T>(name: string): T {
  return JSON.parse(readFixture(name)) as T;
}

interface RecordedCall {
  method: string;
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
}

/**
 * Replays recorded RPC responses so tests run offline. An unrecorded call
 * throws, exactly as the Python `FixtureClient` asserts — including
 * `get_singleton_info`, which no recording carries, so every fixture test
 * exercises the portable traversal.
 */
export function fixtureClient(name: string): FullNodeClient {
  const calls = loadFixture<RecordedCall[]>(name);
  const transport: RpcTransport = async (method, payload) => {
    const wanted = JSON.stringify(payload);
    for (const call of calls) {
      if (call.method === method && JSON.stringify(call.payload) === wanted) {
        return call.response;
      }
    }
    throw new Error(`no recorded RPC response for ${method} ${wanted}`);
  };
  return new FullNodeClient({ baseUrl: "fixture://", transport });
}

export const ALIAS_DID =
  "did:julia:ArD2JyqfkVVbT9Liegqu4jcfBEXtHnPofmF2rsBuq1TX";
export const ORG_DID = "did:julia:BqJasSrzc9aGJmU4U3A2z4XrqozAAMiMhnqHaq4F2cDc";

export const CANARIES = [
  {
    did: ALIAS_DID,
    calls: "rpc_calls_ArD2.json",
    expected: "expected_resolution_ArD2.json",
  },
  {
    did: ORG_DID,
    calls: "rpc_calls_julia_org.json",
    expected: "expected_resolution_julia_org.json",
  },
] as const;

export interface TransitionVector {
  puzzle: string;
  puzzleHash: string;
  case: string;
  slots: number;
  state: string;
  solution: string;
  newState: string;
}

export interface TransitionFixture {
  provenance: Record<string, string>;
  vectors: TransitionVector[];
}
