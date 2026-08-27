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

/** The DID, or a coin its lineage requires, is genuinely absent from the chain. */
export class NotFoundError extends ChainError {}

/**
 * The endpoint could not be reached, or did not answer usefully: a network
 * failure, a timeout, a non-2xx status, an oversized body, or a body that is
 * not JSON. It carries NO information about whether the DID exists, and must
 * never be reported as `notFound`.
 */
export class RpcTransportError extends ChainError {
  /** HTTP status, when the failure was a status code. */
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

/**
 * The node answered, and its answer was an application-level failure
 * (`success: false`). Only this class can mean "no such coin" — and only when
 * the node says so.
 */
export class RpcResponseError extends ChainError {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.code = code;
  }
}

/**
 * The endpoint answered a question other than the one asked: a record whose
 * own identifiers do not match the query. A buggy proxy or a hostile node,
 * either way its answer is unusable.
 */
export class RpcIntegrityError extends ChainError {}

/**
 * Chia RPC has no machine-readable "absent" signal that every node shares. A
 * stock full node answers `{ success: true, coin_record: null }`, which needs
 * no interpretation; Coinset's gateway instead answers `success: false` with
 * `structuredError.code = "COIN_RECORD_NOT_FOUND"`.
 *
 * Absence is recognized ONLY from those two shapes — a known structured code,
 * or a message anchored to the coin record itself. A free-text search for
 * "not found" would classify "database not found" or a proxy's "upstream
 * service not found" as an authoritative absence, which is precisely the
 * outage-becomes-notFound failure this taxonomy exists to prevent. Anything
 * unrecognized is treated as a real error: the safe direction, because a
 * transport-class failure makes a caller retry, while a wrong `notFound` is a
 * durable claim that someone's DID does not exist.
 */
const COIN_ABSENT_CODES = new Set(["COIN_RECORD_NOT_FOUND", "COIN_NOT_FOUND"]);
const COIN_ABSENT_MESSAGE =
  /^\s*coin(?:[ _-]record)?\b[^:]*\bnot[ _-]?found\b/i;

function reportsCoinAbsent(cause: unknown): boolean {
  if (!(cause instanceof RpcResponseError)) return false;
  if (cause.code !== null) return COIN_ABSENT_CODES.has(cause.code);
  // `${method}: ${message}` — test the node's own message, not the prefix.
  const message = cause.message.slice(cause.message.indexOf(": ") + 2);
  return COIN_ABSENT_MESSAGE.test(message);
}

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

/**
 * Read a response body as text, bounded WHILE STREAMING.
 *
 * `response.text()` buffers the whole body before any size check, so a
 * hostile or broken endpoint could exhaust an edge runtime's memory before the
 * limit was ever consulted. This stops at the limit and cancels the transfer.
 * `content-length`, when the endpoint declares one, rejects before a single
 * chunk is read.
 */
async function readBoundedText(
  response: Response,
  limit: number,
  method: string,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new RpcTransportError(
      `${method}: response declares ${declared} bytes, over the ${limit}-byte limit`,
    );
  }
  const body = response.body;
  // No readable stream (an empty body, or a fetch shim without one): there is
  // nothing to bound incrementally, and content-length was already checked.
  if (!body) return response.text();

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new RpcTransportError(
        `${method}: response exceeds the ${limit}-byte limit`,
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Coin id from its three fields: `sha256(parent || puzzle_hash || amount)`. */
export function coinIdFrom(
  parentCoinInfo: Uint8Array,
  puzzleHash: Uint8Array,
  amount: bigint,
): Uint8Array {
  return coinId({ parentCoinInfo, puzzleHash, amount });
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
        throw new RpcTransportError(
          `${method}: HTTP ${response.status}`,
          response.status,
        );
      }
      const text = await readBoundedText(response, MAX_RESPONSE_BYTES, method);
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new RpcTransportError(`${method}: response is not JSON`);
      }
    } catch (cause) {
      if (cause instanceof ChainError) throw cause;
      throw new RpcTransportError(`${method}: ${(cause as Error).message}`);
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
      const structured = data?.structuredError as
        { code?: unknown } | undefined;
      const code =
        typeof structured?.code === "string" ? structured.code : null;
      throw new RpcResponseError(`${method}: ${message}`, code);
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
    } catch (cause) {
      // Only the node's own "no such coin" means absent. A transport failure
      // is propagated: reporting an unreachable node as `notFound` would turn
      // an outage into an authoritative — and cacheable — claim that a DID
      // does not exist.
      if (reportsCoinAbsent(cause)) return null;
      throw cause;
    }
    if (!data.coin_record) return null;
    const record = parseCoinRecord(data.coin_record);
    // A coin id IS the hash of the coin's own fields, so a record that does
    // not hash back to the requested id is an answer to a different question.
    if (!equalBytes(coinId(record.coin), id)) {
      throw new RpcIntegrityError(
        `get_coin_record_by_name returned a coin whose id is not ${toHex(id)}`,
      );
    }
    return record;
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
    const requested = new Set(parentIds.map(toHex));
    return records.map((raw) => {
      const record = parseCoinRecord(raw);
      if (!requested.has(toHex(record.coin.parentCoinInfo))) {
        throw new RpcIntegrityError(
          "get_coin_records_by_parent_ids returned a coin with an unrequested parent",
        );
      }
      return record;
    });
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
    const coin = parseCoin(spend.coin);
    if (!equalBytes(coinId(coin), id)) {
      throw new RpcIntegrityError(
        `get_puzzle_and_solution returned a spend of a coin that is not ${toHex(id)}`,
      );
    }
    return {
      coin,
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
    } catch (cause) {
      // Stop asking only when this endpoint demonstrably does not implement
      // the extension. A timeout or an outage says nothing about that, and
      // must not permanently downgrade a healthy client.
      if (
        cause instanceof RpcTransportError &&
        cause.status !== null &&
        [404, 405, 501].includes(cause.status)
      ) {
        this.singletonInfoEnabled = false;
      }
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
