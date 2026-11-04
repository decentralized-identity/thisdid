import { describe, expect, it } from "vitest";
import {
  EnvConfigError,
  FETCH_POLICY_DEFAULTS,
  optionsFromEnv,
  WEBVH_ENV_VARIABLES,
} from "../index.js";

describe("optionsFromEnv (shared by the CLI and the driver Worker)", () => {
  it("is exported from the package entry with the four variables", () => {
    expect(WEBVH_ENV_VARIABLES).toEqual([
      "WEBVH_TIMEOUT_MS",
      "WEBVH_MAX_RESPONSE_BYTES",
      "WEBVH_MAX_REDIRECTS",
      "WEBVH_ALLOW_PRIVATE_HOSTS",
    ]);
    expect(optionsFromEnv({}).fetchPolicy).toEqual(FETCH_POLICY_DEFAULTS);
  });

  it("accepts the numbers and booleans wrangler vars can carry", () => {
    expect(
      optionsFromEnv({
        WEBVH_TIMEOUT_MS: 3000,
        WEBVH_MAX_RESPONSE_BYTES: 1024,
        WEBVH_MAX_REDIRECTS: 0,
        WEBVH_ALLOW_PRIVATE_HOSTS: false,
      }).fetchPolicy,
    ).toEqual({
      timeoutMs: 3000,
      maxResponseBytes: 1024,
      maxRedirects: 0,
      allowPrivateHosts: false,
    });
  });

  it("throws EnvConfigError for a malformed value", () => {
    for (const env of [
      { WEBVH_TIMEOUT_MS: 0 },
      { WEBVH_TIMEOUT_MS: 1.5 },
      { WEBVH_MAX_RESPONSE_BYTES: "-1" },
      { WEBVH_ALLOW_PRIVATE_HOSTS: "maybe" },
    ]) {
      expect(() => optionsFromEnv(env), JSON.stringify(env)).toThrow(
        EnvConfigError,
      );
    }
  });
});
