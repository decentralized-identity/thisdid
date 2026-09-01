export declare const COINSET_MAINNET = "https://api.coinset.org";
/** Standard Chia singleton launcher puzzle hash. */
export declare const SINGLETON_LAUNCHER_PUZZLE_HASH: Uint8Array<ArrayBufferLike>;
export declare class ChainError extends Error {
}
/** The DID, or a coin its lineage requires, is genuinely absent from the chain. */
export declare class NotFoundError extends ChainError {
}
/**
 * The endpoint could not be reached, or did not answer usefully: a network
 * failure, a timeout, a non-2xx status, an oversized body, or a body that is
 * not JSON. It carries NO information about whether the DID exists, and must
 * never be reported as `notFound`.
 */
export declare class RpcTransportError extends ChainError {
    /** HTTP status, when the failure was a status code. */
    readonly status: number | null;
    constructor(message: string, status?: number | null);
}
/**
 * The node answered, and its answer was an application-level failure
 * (`success: false`). Only this class can mean "no such coin" — and only when
 * the node says so.
 */
export declare class RpcResponseError extends ChainError {
    readonly code: string | null;
    constructor(message: string, code: string | null);
}
/**
 * The endpoint answered a question other than the one asked: a record whose
 * own identifiers do not match the query. A buggy proxy or a hostile node,
 * either way its answer is unusable.
 */
export declare class RpcIntegrityError extends ChainError {
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
/**
 * Every generation of a singleton, oldest first (spec §7.2.1).
 *
 * `generations[0]` is the coin the launcher spend created — the DID's first
 * version — and the last entry is the unspent current coin. Version-specific
 * resolution needs the whole list; current-state resolution needs only its
 * tail, which `lineageOf` extracts.
 */
export interface SingletonHistory {
    prelauncher: CoinRecord;
    launcher: CoinRecord;
    generations: CoinRecord[];
}
/** The current-state view of a fully walked history. */
export declare function lineageOf(history: SingletonHistory): SingletonLineage;
/** Low-level RPC transport. Overridable so tests can replay recordings. */
export type RpcTransport = (method: string, payload: Record<string, unknown>, signal?: AbortSignal) => Promise<Record<string, unknown>>;
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
/** Coin id from its three fields: `sha256(parent || puzzle_hash || amount)`. */
export declare function coinIdFrom(parentCoinInfo: Uint8Array, puzzleHash: Uint8Array, amount: bigint): Uint8Array;
export declare function coinId(coin: Coin): Uint8Array;
export declare class FullNodeClient {
    readonly baseUrl: string;
    private readonly timeoutMs;
    private readonly transport;
    private singletonInfoEnabled;
    constructor(options?: FullNodeClientOptions);
    private httpTransport;
    private post;
    getCoinRecordByName(id: Uint8Array, signal?: AbortSignal): Promise<CoinRecord | null>;
    getCoinRecordsByParentIds(parentIds: Uint8Array[], signal?: AbortSignal): Promise<CoinRecord[]>;
    getPuzzleAndSolution(id: Uint8Array, height: number, signal?: AbortSignal): Promise<CoinSpend>;
    /**
     * Coinset extension: the current unspent coin of a singleton in one call.
     * Returns null on any failure — including a node that does not implement it,
     * after which this client stops asking.
     */
    getSingletonInfo(launcherId: Uint8Array, signal?: AbortSignal): Promise<CoinRecord | null>;
}
/**
 * Walk the singleton from its launcher, recording every generation
 * (spec §7.2.1).
 *
 * The `get_singleton_info` fast path is deliberately NOT used here: it answers
 * "which coin is current", which is the one question a version request is not
 * asking.
 */
export declare function traceHistory(client: FullNodeClient, launcherId: Uint8Array, signal?: AbortSignal): Promise<SingletonHistory>;
/** Walk from launcher ID to the current unspent singleton coin (spec §7.2). */
export declare function traceSingleton(client: FullNodeClient, launcherId: Uint8Array, signal?: AbortSignal): Promise<SingletonLineage>;
//# sourceMappingURL=chain.d.ts.map