import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./support/build-ai-local-target-safety.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = vm.createContext({ exports: {}, module: { exports: {} }, URL, require(name) { if (name === "server-only") return {}; throw new Error(`Unexpected import ${name}`); } });
context.exports = context.module.exports;
new vm.Script(javascript).runInContext(context);
const { inspectBuildAILocalAcceptanceTargets } = context.module.exports;

const inspect = (applicationUrl, supabaseUrl) => ({ ...inspectBuildAILocalAcceptanceTargets({ applicationUrl, supabaseUrl }) });

for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
  test(`accepts exact disposable loopback targets using ${host}`, () => {
    assert.deepEqual(inspect(`http://${host}:3000`, `http://${host}:54321`), {
      ok: true, application: "loopback-local", supabase: "loopback-local",
    });
  });
}

for (const [name, applicationUrl, supabaseUrl] of [
  ["production hostname", "http://127.0.0.1:3000", "https://vmurvcpmqwnxgruhqevf.supabase.co"],
  ["staging hostname", "http://127.0.0.1:3000", "https://pmdgpgfbtolrgmuusszy.supabase.co"],
  ["public hostname", "https://deployiq.example", "http://127.0.0.1:54321"],
  ["private LAN hostname", "http://192.168.1.20:3000", "http://127.0.0.1:54321"],
  ["malformed URL", "not-a-url", "http://127.0.0.1:54321"],
  ["missing application target", undefined, "http://127.0.0.1:54321"],
  ["missing Supabase target", "http://127.0.0.1:3000", undefined],
  ["wrong Supabase port", "http://127.0.0.1:3000", "http://127.0.0.1:54322"],
  ["unexpected Supabase project", "http://127.0.0.1:3000", "https://other.supabase.co"],
  ["lookalike localhost", "http://localhost.example:3000", "http://127.0.0.1:54321"],
  ["path-bearing target", "http://127.0.0.1:3000/admin", "http://127.0.0.1:54321"],
  ["credential-bearing target", "http://user:pass@127.0.0.1:3000", "http://127.0.0.1:54321"],
  ["HTTPS loopback", "https://127.0.0.1:3000", "http://127.0.0.1:54321"],
]) {
  test(`fails closed for ${name}`, () => {
    assert.deepEqual(inspect(applicationUrl, supabaseUrl), { ok: false, reason: "local_target_required" });
  });
}

test("uses structured URL fields rather than loose hostname matching", () => {
  assert.match(source, /new URL\(value\)/);
  assert.match(source, /target\.hostname/);
  assert.match(source, /target\.port/);
  assert.doesNotMatch(source, /includes\(["'`]localhost/);
});
