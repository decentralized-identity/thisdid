import { expect, it } from "vitest";
import { parseFilter } from "./analytics";

it("validates analytics filters and defaults unknown ranges", () => {
  expect(
    parseFilter(
      new URL("https://example.test/data?range=week&country=TR&method=web"),
    ),
  ).toEqual({ range: "week", country: "TR", method: "web" });
  expect(
    parseFilter(new URL("https://example.test/data?range=nope")).range,
  ).toBe("day");
});
