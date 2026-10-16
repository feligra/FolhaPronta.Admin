const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");
const ts = require("typescript");

if (process.argv.includes("--timezone-case")) {
  const source = fs.readFileSync(path.join(__dirname, "../src/utils/format.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const sandbox = { exports: {}, Date };
  vm.runInNewContext(compiled, sandbox);
  const { formatDate, formatDateTime } = sandbox.exports;

  // O mesmo login pode chegar do banco legado, de um DateTime UTC ou com offset.
  for (const timestamp of [
    "2026-10-16T15:30:00", "2026-10-16T15:30:00Z",
    "2026-10-16T15:30:00+00:00", "2026-10-16T12:30:00-03:00",
    "2026-10-16T15:30:00.0000000", " 2026-10-16T15:30:00Z ",
  ]) {
    assert.equal(formatDateTime(timestamp), "16/10/2026, 12:30:00", timestamp);
    assert.equal(formatDate(timestamp), "16/10/2026", timestamp);
  }
  for (const timestamp of ["2026-10-16T01:00:00", "2026-10-16T01:00:00Z"]) {
    assert.equal(formatDateTime(timestamp), "15/10/2026, 22:00:00");
    assert.equal(formatDate(timestamp), "15/10/2026");
  }
  assert.equal(formatDate("2026-10-16"), "16/10/2026");
  assert.equal(formatDateTime("2026-10-16"), "16/10/2026");
  for (const absent of [null, undefined, "", " ", "data inválida"]) {
    assert.equal(formatDate(absent), "—");
    assert.equal(formatDateTime(absent), "—");
  }
} else {
  for (const timeZone of ["America/Sao_Paulo", "UTC", "Asia/Tokyo"]) {
    test(`Datas do admin usam Brasília mesmo com dispositivo em ${timeZone}`, () => {
      execFileSync(process.execPath, [__filename, "--timezone-case"], {
        env: { ...process.env, TZ: timeZone }, stdio: "pipe",
      });
    });
  }
}
