import type { DIDResolutionOptions, DIDResolutionResult } from "did-resolver";

export const DRIVER_PROTOCOL_VERSION = 1 as const;

export interface DriverRequestV1 {
  protocol: typeof DRIVER_PROTOCOL_VERSION;
  did: string;
  options?: Pick<DIDResolutionOptions, "accept" | "versionId" | "versionTime">;
}

export interface DriverResponseV1 {
  protocol: typeof DRIVER_PROTOCOL_VERSION;
  result: DIDResolutionResult;
  driver: {
    method: string;
    packageName: string;
    packageVersion: string;
    durationMs: number;
  };
}

export interface DriverServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
