/**
 * did:webvh resolution options (ThisDID).
 *
 * The method's resolution interface takes `versionId`, `versionTime` and
 * `versionNumber`, from the DID URL's query (which the method specification
 * says a resolver MUST honour) or from the resolution options. Every selector
 * is validated before it reaches the core: `versionTime` is the XML datetime
 * form DID Resolution requires, in UTC without fractional seconds, and only
 * for a real calendar date (an unparseable string used to become an Invalid
 * Date that resolved to NotFound); `versionNumber` is a positive integer;
 * `versionId` is the method's `<number>-<hash>` form; selectors are mutually
 * exclusive, may appear once, and must agree between query and options.
 * Anything else is `invalidOptions`.
 */

export interface WebvhSelectors {
  versionId?: string;
  versionTime?: Date;
  versionNumber?: number;
}

export class InvalidOptions extends Error {}

const VERSION_ID = /^[1-9]\d*-[1-9A-HJ-NP-Za-km-z]+$/;

/** Strict UTC XML datetime: YYYY-MM-DDTHH:MM:SSZ on a real calendar date. */
export function parseUtcDatetime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().replace(".000Z", "Z") !== value) return null;
  return parsed;
}

const SELECTORS = ["versionId", "versionTime", "versionNumber"] as const;
type Selector = (typeof SELECTORS)[number];

function fromQuery(query: unknown): Partial<Record<Selector, string>> {
  const out: Partial<Record<Selector, string>> = {};
  if (typeof query !== "string" || query.length === 0) return out;
  const params = new URLSearchParams(query);
  for (const name of SELECTORS) {
    const values = params.getAll(name);
    if (values.length > 1) {
      throw new InvalidOptions(
        `${name} may appear at most once in the DID URL`,
      );
    }
    if (values.length === 1) out[name] = values[0];
  }
  return out;
}

export function readSelectors(
  parsed: { query?: string } | null | undefined,
  options: Record<string, unknown> | null | undefined,
): WebvhSelectors {
  const query = fromQuery(parsed?.query);
  const raw: Partial<Record<Selector, unknown>> = { ...query };
  for (const name of SELECTORS) {
    const value = options?.[name];
    if (value === undefined) continue;
    if (name in query && String(value) !== query[name]) {
      throw new InvalidOptions(
        `${name} differs between the DID URL and the resolution options`,
      );
    }
    raw[name] = value;
  }
  const present = SELECTORS.filter((name) => raw[name] !== undefined);
  if (present.length > 1) {
    throw new InvalidOptions(
      `${present.join(", ")} are mutually exclusive; use one selector`,
    );
  }
  const out: WebvhSelectors = {};
  if (raw.versionId !== undefined) {
    if (typeof raw.versionId !== "string" || !VERSION_ID.test(raw.versionId)) {
      throw new InvalidOptions(
        `Invalid versionId ${JSON.stringify(raw.versionId)}: expected the did:webvh <number>-<entryHash> form`,
      );
    }
    out.versionId = raw.versionId;
  }
  if (raw.versionTime !== undefined) {
    const time =
      typeof raw.versionTime === "string"
        ? parseUtcDatetime(raw.versionTime)
        : null;
    if (time === null) {
      throw new InvalidOptions(
        `Invalid versionTime ${JSON.stringify(raw.versionTime)}: expected an XML datetime in UTC without fractional seconds (YYYY-MM-DDTHH:MM:SSZ)`,
      );
    }
    out.versionTime = time;
  }
  if (raw.versionNumber !== undefined) {
    const value = raw.versionNumber;
    const number =
      typeof value === "number"
        ? value
        : typeof value === "string" && /^[1-9]\d*$/.test(value)
          ? Number(value)
          : NaN;
    if (!Number.isSafeInteger(number) || number < 1) {
      throw new InvalidOptions(
        `Invalid versionNumber ${JSON.stringify(value)}: expected a positive integer`,
      );
    }
    out.versionNumber = number;
  }
  return out;
}
