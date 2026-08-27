/**
 * Chia full-node RPC client and did:julia singleton traversal.
 *
 * Speaks plain HTTPS to ANY Chia full node RPC — the spec promises resolution
 * against any node, so nothing here may depend on a particular operator. The
 * zero-configuration default is the open Coinset endpoint, matching the Python
 * reference resolver.
 *
 * Traversal (spec §7.2): start at the launcher coin and follow the odd-amount
 * child of each spend — the singleton consensus rules permit exactly one odd
 * child per singleton spend — until the unspent current coin is reached.
 *
 * Coinset additionally serves `POST /get_singleton_info`, which returns that
 * unspent coin in a single call. It is used as a FAST PATH only: any failure
 * falls back to the portable traversal, and the trust model is identical
 * either way, because state is re-verified by puzzle-hash recomputation
 * against whichever coin is reported (see `state.ts`).
 */
import { sha256 } from "@noble/hashes/sha256";
import { fromHex, intToAtom, toHex } from "./clvm.js";

export const COINSET_MAINNET = "https://api.coinset.org";

/** Standard Chia singleton launcher puzzle hash. */
export const SINGLETON_LAUNCHER_PUZZLE_HASH = fromHex(
  "eff07522495060c066f66f32acc2a77e3a3e737aca8baea4d1a64ea4cdc13da9",
);

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
/** Hard bound on singleton generations walked by the portable traversal. */
const MAX_GENERATIONS = 4096;

export class ChainError extends Error {}
export class NotFoundError extends ChainError {}

export interface Coin {
  parentCoinInfo: Uint8Array;
  puzzleHash: Uint8Array;
  amount: bigint;
}

export interface CoinRecord {
  coin: Coin;
  spent: boolean;
  confirmedBlockIndex: number;
  spentBlockIndex: number;
  timestamp: number;
}

export interface CoinSpend {
  coin: Coin;
  puzzleReveal: Uint8Array;
  solution: Uint8Array;
}

/** The coins a resolver needs: genesis commitment through current state. */
export interface SingletonLineage {
  prelauncher: CoinRecord;
  launcher: CoinRecord;
  /** The unspent singleton coin. */
  current: CoinRecord;
  /** Its parent — the most recent spend. */
  parent: CoinRecord;
  /** Generations traversed, or null when the fast path skipped the walk. */
  generations: number | null;
}

/** Low-level RPC transport. Overridable so tests can replay recordings. */
export type RpcTransport = (
  method: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<Record<string, unknown>>;

export interface FullNodeClientOptions {
  /** Full node RPC base URL. Default: the open Coinset mainnet endpoint. */
  baseUrl?: string;
  /** Per-request wall-clock bound. Default 8000 ms. */
  timeoutMs?: number;
  /** Replace the HTTP transport entirely (tests, custom auth, mTLS proxies). */
  transport?: RpcTransport;
  /**
   * Try the Coinset `get_singleton_info` extension before walking the
   * singleton generation by generation. Default true; a node that does not
   * serve it simply falls back, at the cost of two calls per generation.
   */
  useSingletonInfo?: boolean;
}

export function coinId(coin: Coin): Uint8Array {
  const amount = intToAtom(coin.amount);
  const buffer = new Uint8Array(
    coin.parentCoinInfo.length + coin.puzzleHash.length + amount.length,
  );
  buffer.set(coin.parentCoinInfo, 0);
  buffer.set(coin.puzzleHash, coin.parentCoinInfo.length);
  buffer.set(amount, coin.parentCoinInfo.length + coin.puzzleHash.length);
  return sha256(buffer);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ChainError(`malformed ${what} in RPC response`);
  }
  return value as Record<string, unknown>;
}

function parseCoin(value: unknown): Coin {
  const raw = asRecord(value, "coin");
  return {
    parentCoinInfo: fromHex(String(raw.parent_coin_info)),
    puzzleHash: fromHex(String(raw.puzzle_hash)),
    amount: BigInt(raw.amount as string | number),
  };
}

function parseCoinRecord(value: unknown): CoinRecord {
  const raw = asRecord(value, "coin record");
  const spentBlockIndex = Number(raw.spent_block_index ?? 0);
  return {
    coin: parseCoin(raw.coin),
    spent: raw.spent === undefined ? spentBlockIndex !== 0 : Boolean(raw.spent),
    confirmedBlockIndex: Number(raw.confirmed_block_index ?? 0),
    spentBlockIndex,
    timestamp: Number(raw.timestamp ?? 0),
  };
}

export class FullNodeClient {
  readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly transport: RpcTransport;
  private singletonInfoEnabled: boolean;

  constructor(options: FullNodeClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? COINSET_MAINNET).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.transport = options.transport ?? this.httpTransport.bind(this);
    this.singletonInfoEnabled = options.useSingletonInfo ?? true;
  }

  private async httpTransport(
    method: string,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const response = await fetch(`${this.baseUrl}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ChainError(`${method}: HTTP ${response.status}`);
      }
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
        throw new ChainError(`${method}: response exceeds size limit`);
      }
      return JSON.parse(text) as Record<string, unknown>;
    } catch (cause) {
      if (cause instanceof ChainError) throw cause;
      throw new ChainError(`${method}: ${(cause as Error).message}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private async post(
    method: string,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const data = await this.transport(method, payload, signal);
    if (!data || data.success !== true) {
      const message =
        (data?.error as string | undefined) ?? "RPC returned success=false";
      throw new ChainError(`${method}: ${message}`);
    }
    return data;
  }

  async getCoinRecordByName(
    id: Uint8Array,
    signal?: AbortSignal,
  ): Promise<CoinRecord | null> {
    let data: Record<string, unknown>;
    try {
      data = await this.post(
        "get_coin_record_by_name",
        { name: `0x${toHex(id)}` },
        signal,
      );
    } catch {
      return null;
    }
    return data.coin_record ? parseCoinRecord(data.coin_record) : null;
  }

  async getCoinRecordsByParentIds(
    parentIds: Uint8Array[],
    signal?: AbortSignal,
  ): Promise<CoinRecord[]> {
    const data = await this.post(
      "get_coin_records_by_parent_ids",
      {
        parent_ids: parentIds.map((id) => `0x${toHex(id)}`),
        include_spent_coins: true,
      },
      signal,
    );
    const records = data.coin_records;
    if (!Array.isArray(records)) return [];
    return records.map(parseCoinRecord);
  }

  async getPuzzleAndSolution(
    id: Uint8Array,
    height: number,
    signal?: AbortSignal,
  ): Promise<CoinSpend> {
    const data = await this.post(
      "get_puzzle_and_solution",
      { coin_id: `0x${toHex(id)}`, height },
      signal,
    );
    const spend = asRecord(data.coin_solution, "coin_solution");
    return {
      coin: parseCoin(spend.coin),
      puzzleReveal: fromHex(String(spend.puzzle_reveal)),
      solution: fromHex(String(spend.solution)),
    };
  }

  /**
   * Coinset extension: the current unspent coin of a singleton in one call.
   * Returns null on any failure — including a node that does not implement it,
   * after which this client stops asking.
   */
  async getSingletonInfo(
    launcherId: Uint8Array,
    signal?: AbortSignal,
  ): Promise<CoinRecord | null> {
    if (!this.singletonInfoEnabled) return null;
    try {
      const data = await this.post(
        "get_singleton_info",
        { launcher_id: `0x${toHex(launcherId)}` },
        signal,
      );
      if (!data.coin_record) return null;
      const record = parseCoinRecord(data.coin_record);
      return record.spent ? null : record;
    } catch {
      this.singletonInfoEnabled = false;
      return null;
    }
  }
}

/** Walk from launcher ID to the current unspent singleton coin (spec §7.2). */
export async function traceSingleton(
  client: FullNodeClient,
  launcherId: Uint8Array,
  signal?: AbortSignal,
): Promise<SingletonLineage> {
  const launcher = await client.getCoinRecordByName(launcherId, signal);
  if (launcher === null) {
    throw new NotFoundError("launcher coin not found on chain");
  }
  if (!equalBytes(launcher.coin.puzzleHash, SINGLETON_LAUNCHER_PUZZLE_HASH)) {
    throw new NotFoundError("coin exists but is not a singleton launcher");
  }
  if (!launcher.spent) {
    throw new NotFoundError("launcher coin exists but was never spent");
  }

  const prelauncher = await client.getCoinRecordByName(
    launcher.coin.parentCoinInfo,
    signal,
  );
  if (prelauncher === null) {
    throw new NotFoundError("prelauncher coin not found");
  }

  const fast = await client.getSingletonInfo(launcherId, signal);
  if (fast !== null) {
    const parent = await client.getCoinRecordByName(
      fast.coin.parentCoinInfo,
      signal,
    );
    if (parent !== null && parent.spent) {
      return {
        prelauncher,
        launcher,
        current: fast,
        parent,
        generations: null,
      };
    }
    // The extension answered with something the portable path can check;
    // fall through rather than trusting an unusable answer.
  }

  let record = launcher;
  let parent = launcher;
  let generations = 0;
  while (record.spent) {
    if (generations >= MAX_GENERATIONS) {
      throw new ChainError(
        `singleton exceeds ${MAX_GENERATIONS} generations; refusing to walk further`,
      );
    }
    const children = await client.getCoinRecordsByParentIds(
      [coinId(record.coin)],
      signal,
    );
    const odd = children.filter((child) => child.coin.amount % 2n === 1n);
    if (odd.length !== 1) {
      throw new ChainError(
        `expected exactly one odd-amount singleton child, found ${odd.length}`,
      );
    }
    parent = record;
    record = odd[0];
    generations += 1;
  }

  return { prelauncher, launcher, current: record, parent, generations };
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
