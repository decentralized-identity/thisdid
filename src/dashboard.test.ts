import { expect, it } from "vitest";
import { renderDashboard } from "./dashboard";

it("renders a syntactically valid four-provider status section", () => {
  const html = renderDashboard();
  expect(html).toContain("<h2>Provider status</h2>");
  expect(html).toContain("['ThisDID',aggregate(local)]");
  expect(html).toContain("['GoPlausible',providers.GoPlausible]");
  expect(html).toContain("['Godiddy',providers.godiddy]");
  expect(html).toContain("['Archon',providers.archon]");
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  expect(script).toBeTruthy();
  expect(() => new Function(script!)).not.toThrow();
});
