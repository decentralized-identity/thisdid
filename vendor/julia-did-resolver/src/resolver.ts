/**
 * did:julia resolver for the DIF `did-resolver` interface.
 *
 * Resolution reads public Chia blockchain state (spec §7.2) through any full
 * node RPC — by default the open Coinset endpoint. No did:julia-specific
 * service is contacted, and no operator is trusted: the singleton's state is
 * re-derived from the most recent spend and checked against the puzzle hash of
 * the coin the chain actually holds.
 *
 * The driver executes no CLVM. See
 * `docs/adr/0001-state-derivation-without-clvm.md`.
 */
import type {
  DIDResolutionOptions,
  DIDResolutionResult,
  DIDResolver,
  ParsedDID,
  Resolvable,
  ResolverRegistry,
} from "did-resolver";
import {
  ChainError,
  type CoinRecord,
  FullNodeClient,
  type FullNodeClientOptions,
  NotFoundError,
  type SingletonHistory,
  coinId,
  traceHistory,
  traceSingleton,
} from "./chain.js";
import { fromHex, toHex } from "./clvm.js";
import { InvalidDidError, parseDid } from "./identifier.js";
import {
  type DerivedState,
  StateError,
  UnverifiableStateError,
  deriveVerifiedState,
  genesisPublicKey,
  isCurrentPuzzle,
  revealedKeysFromSpend,
  revealedVerifiedState,
} from "./state.js";
import { buildDocument, errorResult, resolutionResult } from "./diddoc.js";

export const METHOD = "julia";

/** The single representation this resolver produces. */
export const CONTENT_TYPE = "application/did+ld+json";

/**
 * Whether a media parameter appearing in an `accept` media range is satisfied
 * by the representation this resolver produces.
 *
 * The representation is `application/did+ld+json` carrying NO parameters, so a
 * range that names one is asking for something narrower. The single exception
 * is a UTF-8 `charset`, which the representation genuinely satisfies (JSON is
 * UTF-8 by definition, RFC 8259 §8.1). Everything else — a JSON-LD `profile`
 * this resolver does not emit, a non-UTF-8 charset — makes the range
 * non-matching rather than being quietly ignored.
 */
function mediaParameterSatisfied(name: string, value: string): boolean {
  const unquoted = value.replace(/^"|"$/g, "").toLowerCase();
  return name === "charset" && (unquoted === "utf-8" || unquoted === "utf8");
}

/**
 * Whether an `accept` value asks for something this resolver can produce.
 *
 * Only the JSON-LD representation is produced, so anything else is refused with
 * `representationNotSupported` rather than answered with a document the caller
 * did not ask for. `application/did+json` is deliberately NOT accepted: serving
 * a JSON-LD-shaped document under that media type would be the same overclaim
 * in the other direction.
 *
 * Follows RFC 9110 §12.5.1 in three respects:
 *
 *  - **Media parameters preceding `q` are part of the media range.** A range
 *    naming a parameter the representation does not carry does not match at
 *    all, and a matching parameter makes the range MORE specific than the bare
 *    type — the spec's own example ranks `text/plain;format=flowed` above
 *    `text/plain`. Parameters after `q` are accept extensions and are ignored.
 *  - Specificity is two INDEPENDENT dimensions compared lexicographically:
 *    how concrete the type is, and only then how many parameters matched. They
 *    must not be added together, or a parameterized wildcard would tie an
 *    exact type — `application/*;charset=utf-8` is never as specific as
 *    `application/did+ld+json`, whatever parameters it carries.
 *  - **A quality of zero means "not acceptable"**, so it is a rejection rather
 *    than a weak preference.
 *  - **The most specific matching range decides.** `application/did+ld+json,
 *    *\/*;q=0` is acceptable; `application/did+ld+json;q=0, *\/*` is not.
 *    Among equally specific ranges the highest quality wins, so a
 *    self-contradictory header errs toward serving the caller.
 *
 * This is deliberately not general content negotiation — there is one
 * representation to negotiate over.
 */
export function producesRepresentation(accept: string): boolean {
  // An empty or whitespace-only value carries no preference, like no header.
  if (accept.trim() === "") return true;

  let best: {
    concreteness: number;
    parameters: number;
    quality: number;
  } | null = null;
  for (const entry of accept.split(",")) {
    const parts = entry.split(";");
    const media = parts[0].trim().toLowerCase();
    // How concrete the type itself is: exact > type/* > */*.
    const concreteness =
      media === CONTENT_TYPE
        ? 3
        : media === "application/*"
          ? 2
          : media === "*/*"
            ? 1
            : 0;
    if (concreteness === 0) continue;
    let parameters = 0;

    let quality = 1;
    let seenQuality = false;
    let matches = true;
    for (const parameter of parts.slice(1)) {
      const separator = parameter.indexOf("=");
      const name = (separator < 0 ? parameter : parameter.slice(0, separator))
        .trim()
        .toLowerCase();
      const value = separator < 0 ? "" : parameter.slice(separator + 1).trim();

      if (!seenQuality && name === "q") {
        seenQuality = true;
        const parsed = Number.parseFloat(value);
        // An unparseable quality is ignored rather than read as a rejection.
        if (Number.isFinite(parsed)) quality = parsed;
        continue;
      }
      if (seenQuality) continue; // accept extension — not part of the range
      if (!mediaParameterSatisfied(name, value)) {
        matches = false;
        break;
      }
      parameters += 1; // a satisfied parameter narrows the range further
    }
    if (!matches) continue;

    // Lexicographic: concreteness first, then matched parameters, and only
    // among ranges equally specific in BOTH does quality break the tie — so a
    // self-contradictory header errs toward serving the caller.
    if (
      best === null ||
      concreteness > best.concreteness ||
      (concreteness === best.concreteness &&
        (parameters > best.parameters ||
          (parameters === best.parameters && quality > best.quality)))
    ) {
      best = { concreteness, parameters, quality };
    }
  }
  return best !== null && best.quality > 0;
}

export interface JuliaResolverOptions extends FullNodeClientOptions {
  /** Supply a pre-built client instead of constructing one per registry. */
  client?: FullNodeClient;
}

/** Per-request DID resolution options, plus a cancellation signal. */
export interface JuliaResolutionRequest extends DIDResolutionOptions {
  signal?: AbortSignal;
  /**
   * The `versionTime` DID parameter (spec §7.2.1): an XML datetime carrying a
   * UTC designator or an explicit offset. `versionId` is declared by the DIF
   * `did-resolver` interface itself.
   */
  versionTime?: string;
}

/** A version option the caller wrote wrong — an invalid DID URL, not a miss. */
class InvalidVersionError extends Error {}

/**
 * An XML Schema dateTime with a timezone, the form DID Resolution requires.
 * Every field is captured because each one is range-checked
 * below: `Date.parse` normalizes an impossible date into a real one rather than
 * rejecting it, so it cannot be the judge of whether a date exists.
 */
const XML_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
    return 29;
  }
  return MONTH_LENGTHS[month - 1];
}

/**
 * A did:julia version ID is the coin ID of a singleton generation (§8.5): 32
 * octets, hex, with or without a `0x` prefix.
 */
function parseVersionId(value: string): Uint8Array {
  const text = value.trim().replace(/^0[xX]/, "");
  if (text.length !== 64 || !/^[0-9a-fA-F]+$/.test(text)) {
    throw new InvalidVersionError(
      "a did:julia versionId is a 32-octet coin ID in hex (64 hex digits); " +
        `got ${text.length}`,
    );
  }
  return fromHex(text.toLowerCase());
}

/**
 * XML datetime -> POSIX seconds.
 *
 * Every field is range-checked against the calendar, so a date that does not
 * exist is rejected rather than rolled forward into one that does. `Date.parse`
 * cannot do this: it normalizes, turning `2026-02-30T00:00:00Z` into March 2nd
 * and `2026-02-29T00:00:00Z` into March 1st, and it accepts hour 24 as the next
 * day. A resolver that answered those with the version current on the
 * normalized date would be answering a different question than the caller
 * asked, which is the one failure they cannot detect. The Python reference
 * resolver rejects exactly this set, and the two must not disagree about which
 * requests are valid.
 *
 * Sub-second precision is truncated — the DID Resolution specification requires
 * datetimes without it, and a Chia block's timestamp has one-second resolution
 * anyway.
 */
export function parseVersionTime(value: string): number {
  const match = XML_DATETIME.exec(value.trim());
  if (match === null) {
    throw new InvalidVersionError(
      "versionTime must be an XML datetime carrying a UTC designator or an " +
        `explicit offset; got '${value}'`,
    );
  }
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    fraction,
    sign,
    offsetHour,
    offsetMinute,
  ] = match.map((field) => (field === undefined ? field : field)) as string[];
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  // XML Schema admits year 0000 (1 BCE under astronomical numbering) and
  // expanded years beyond four digits; this resolver accepts 0001..9999, the
  // range both implementations can represent exactly, and refuses the rest
  // rather than mapping it somewhere it does not belong.
  if (y < 1) {
    throw new InvalidVersionError(
      `versionTime year must be in 0001..9999; got ${year}`,
    );
  }
  if (mo < 1 || mo > 12) {
    throw new InvalidVersionError(
      `versionTime month must be in 1..12; got ${mo}`,
    );
  }
  if (d < 1 || d > daysInMonth(y, mo)) {
    throw new InvalidVersionError(
      `versionTime day ${d} does not exist in month ${mo} of ${y}`,
    );
  }
  const h = Number(hour);
  const mi = Number(minute);
  const sec = Number(second);
  // `24:00:00` is XML Schema's end-of-day form and denotes the following day's
  // midnight (xmlschema11-2 §3.3.8, endOfDayFrag). It is a defined lexical
  // mapping onto one unambiguous instant, not a value being coerced into a
  // different one, so honouring it answers exactly the question asked.
  const endOfDay = h === 24;
  if (endOfDay) {
    if (
      mi !== 0 ||
      sec !== 0 ||
      (fraction !== undefined && /[^0]/.test(fraction))
    ) {
      throw new InvalidVersionError(
        "versionTime hour 24 is only the end-of-day form 24:00:00",
      );
    }
  } else if (h > 23 || mi > 59 || sec > 59) {
    throw new InvalidVersionError(
      `versionTime ${hour}:${minute}:${second} is not a time of day`,
    );
  }

  let offsetSeconds = 0;
  if (sign !== undefined) {
    const oh = Number(offsetHour);
    const om = Number(offsetMinute);
    // XML Schema admits offsets of ±00:00 through ±13:59, plus exactly ±14:00 —
    // the range real timezones occupy. Anything wider is not an XML datetime,
    // whatever instant it might seem to denote.
    if (!((oh <= 13 && om <= 59) || (oh === 14 && om === 0))) {
      throw new InvalidVersionError(
        "versionTime carries a UTC offset outside XML Schema's ±14:00 range: " +
          `${sign}${offsetHour}:${offsetMinute}`,
      );
    }
    offsetSeconds = (oh * 3600 + om * 60) * (sign === "-" ? -1 : 1);
  }

  if (endOfDay && y === 9999 && mo === 12 && d === 31) {
    // The end-of-day form of the last representable day names midnight of year
    // 10000, which is outside the range above. Refusing it is the same rule
    // applied to the instant the value denotes rather than to the digits it is
    // written with.
    throw new InvalidVersionError(
      "versionTime 9999-12-31T24:00:00 names midnight of year 10000, outside " +
        "the 0001..9999 range this resolver accepts",
    );
  }

  // NOT `Date.UTC(y, ...)`: it applies a legacy 1900 offset to years 0 through
  // 99, so `0001-01-01` would silently become 1901 — a different instant than
  // the caller named, answered as though it were theirs. `setUTCFullYear` has
  // no such rule.
  const moment = new Date(0);
  moment.setUTCFullYear(y, mo - 1, d);
  moment.setUTCHours(endOfDay ? 0 : h, mi, sec, 0);
  return (
    Math.floor(moment.getTime() / 1000) + (endOfDay ? 86400 : 0) - offsetSeconds
  );
}

/** `YYYY-MM-DDTHH:MM:SSZ` for an error message about a block's timestamp. */
function utcSeconds(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Index of the generation a version request names (spec §7.2.1). */
function selectGeneration(
  history: SingletonHistory,
  did: string,
  versionId: Uint8Array | null,
  versionTime: number | null,
): number {
  const generations = history.generations;
  if (versionId !== null) {
    const wanted = toHex(versionId);
    const index = generations.findIndex(
      (record) => toHex(coinId(record.coin)) === wanted,
    );
    if (index < 0) {
      throw new NotFoundError(
        `no generation of ${did} has version ID 0x${wanted}`,
      );
    }
    return index;
  }

  // The latest generation confirmed at or before the requested time. Several
  // generations can share a timestamp (a singleton may be spent more than once
  // in one block); the last of them is the state that block left behind.
  let selected = -1;
  generations.forEach((record, index) => {
    if (record.timestamp && record.timestamp <= (versionTime as number)) {
      selected = index;
    }
  });
  if (selected < 0) {
    throw new NotFoundError(
      `${did} had no version at the requested time; its first version was ` +
        `confirmed at ${utcSeconds(generations[0].timestamp)}`,
    );
  }
  return selected;
}

/**
 * Resolve a did:julia DID to a DID resolution result (spec §7.2, §8).
 *
 * With no version option this reads the singleton's current state. With
 * `versionId` or `versionTime` — mutually exclusive, as DID Resolution
 * requires — it walks the DID's lineage and answers for the generation that
 * version names (spec §7.2.1). A superseded generation's state is read from
 * its own spend and checked against that coin's own puzzle hash, so history
 * is served under exactly the commitment current state is served under: a
 * version this resolver cannot verify is an error, never a guess, and the
 * current document is never returned in place of a requested one.
 *
 * The only representation produced is `application/did+ld+json`, which every
 * result reports in `didResolutionMetadata.contentType`.
 */
export async function resolve(
  did: string,
  options: JuliaResolverOptions = {},
  resolutionOptions: JuliaResolutionRequest = {},
): Promise<DIDResolutionResult> {
  const accept = resolutionOptions.accept;
  if (accept !== undefined && !producesRepresentation(accept)) {
    return errorResult(
      "representationNotSupported",
      `did:julia resolution produces ${CONTENT_TYPE} only; '${accept}' is not available`,
    );
  }
  const { versionId, versionTime } = resolutionOptions;
  if (versionId !== undefined && versionTime !== undefined) {
    return errorResult(
      "unsupportedResolutionOption",
      "versionId and versionTime are mutually exclusive; supply at most one",
    );
  }
  const signal = resolutionOptions.signal;
  let launcherId: Uint8Array;
  try {
    launcherId = parseDid(did);
  } catch (cause) {
    if (cause instanceof InvalidDidError) {
      return errorResult("invalidDid", cause.message);
    }
    throw cause;
  }

  let targetId: Uint8Array | null = null;
  let targetTime: number | null = null;
  try {
    if (versionId !== undefined) targetId = parseVersionId(versionId);
    if (versionTime !== undefined) targetTime = parseVersionTime(versionTime);
  } catch (cause) {
    if (cause instanceof InvalidVersionError) {
      return errorResult("invalidDidUrl", cause.message);
    }
    throw cause;
  }
  const versioned = targetId !== null || targetTime !== null;

  const client = options.client ?? new FullNodeClient(options);

  try {
    let prelauncherOf: { prelauncher: CoinRecord };
    let record: CoinRecord;
    let parent: CoinRecord;
    let following: CoinRecord | null = null;
    let created: number | undefined;

    if (versioned) {
      const history = await traceHistory(client, launcherId, signal);
      const index = selectGeneration(history, did, targetId, targetTime);
      record = history.generations[index];
      parent = index > 0 ? history.generations[index - 1] : history.launcher;
      following = history.generations[index + 1] ?? null;
      created = history.generations[0].timestamp;
      prelauncherOf = history;
    } else {
      const lineage = await traceSingleton(client, launcherId, signal);
      record = lineage.current;
      parent = lineage.parent;
      prelauncherOf = lineage;
    }

    // A superseded generation reveals its own state in its own spend; the
    // unspent one has no spend of its own, so its state is derived from the
    // parent's. Either way the answer must reproduce `record`'s puzzle hash.
    let spend;
    let derived: DerivedState;
    if (record.spent) {
      spend = await client.getPuzzleAndSolution(
        coinId(record.coin),
        record.spentBlockIndex,
        signal,
      );
      derived = revealedVerifiedState(
        spend,
        record.coin.puzzleHash,
        launcherId,
      );
    } else {
      spend = await client.getPuzzleAndSolution(
        coinId(parent.coin),
        parent.spentBlockIndex,
        signal,
      );
      derived = deriveVerifiedState(
        spend,
        parent.coin.puzzleHash,
        record.coin.puzzleHash,
        launcherId,
      );
    }

    const candidates = revealedKeysFromSpend(spend, derived.state);
    const genesisKey = await genesisPublicKey(
      client,
      prelauncherOf,
      derived.genesisKeyHash,
      signal,
    );
    if (genesisKey !== null) candidates.push(genesisKey);

    return resolutionResult({
      state: derived.state,
      document: buildDocument(derived.state, candidates),
      versionCoinId: coinId(record.coin),
      confirmedTimestamp: record.timestamp,
      // True by construction: both routes return only a state whose recomputed
      // singleton puzzle hash equals the coin's, and throw otherwise. The field
      // is kept for parity with the reference resolver and because its absence
      // would be a silent claim.
      verified: true,
      currentPuzzle: isCurrentPuzzle(derived.state),
      ...(created !== undefined ? { createdTimestamp: created } : {}),
      ...(following !== null
        ? {
            nextVersionCoinId: coinId(following.coin),
            nextTimestamp: following.timestamp,
          }
        : {}),
    });
  } catch (cause) {
    if (cause instanceof NotFoundError) {
      return errorResult("notFound", cause.message);
    }
    if (cause instanceof UnverifiableStateError) {
      return errorResult("unverifiableState", cause.message);
    }
    if (cause instanceof ChainError || cause instanceof StateError) {
      return errorResult("internalError", cause.message);
    }
    return errorResult("internalError", (cause as Error).message);
  }
}

/** DIF `did-resolver` registry entry for `did:julia`. */
export function getResolver(
  options: JuliaResolverOptions = {},
): ResolverRegistry {
  const client = options.client ?? new FullNodeClient(options);
  const resolver: DIDResolver = async (
    did: string,
    _parsed: ParsedDID,
    _resolver: Resolvable,
    resolutionOptions: DIDResolutionOptions,
  ): Promise<DIDResolutionResult> =>
    resolve(did, { ...options, client }, resolutionOptions ?? {});
  return { [METHOD]: resolver };
}
