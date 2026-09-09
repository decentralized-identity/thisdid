#!/usr/bin/env node
/** Executable entry for `thisdid-resolve-peer` — see cli.ts for the logic. */
import { main } from "./cli.js";

// The only Node globals this entry touches, declared here so the package
// stays free of @types/node; everything else is runtime-agnostic.
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
};

main(process.argv.slice(2), process.env, {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);
