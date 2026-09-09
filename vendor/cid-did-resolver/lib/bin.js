#!/usr/bin/env node
/** Executable entry for `thisdid-resolve-cid` — see cli.ts for the logic. */
import { main } from "./cli.js";
main(process.argv.slice(2), process.env, {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
}).then((code) => {
    process.exitCode = code;
}, (error) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
});
//# sourceMappingURL=bin.js.map