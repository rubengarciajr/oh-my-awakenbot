import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = new URL("./release-manifest.mjs", import.meta.url);
const version = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")).version;
const names = [`awaken-bot-${version}-macos-arm64.app.tar.gz`, `awaken-bot-${version}-macos-x64.app.tar.gz`, `awaken-bot-${version}-windows-x64-setup.exe`];

function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), "awaken-release-"));
  try {
    for (const name of names) {
      writeFileSync(join(dir, name), "test bundle");
      writeFileSync(join(dir, name + ".sig"), "test-signature");
    }
    run(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const invoke = (dir, tag = `awakenbot-v${version}`, ...args) => spawnSync(process.execPath, [fileURLToPath(script), dir, "rubengarciajr/oh-my-awakenbot", tag, ...args], { encoding: "utf8" });

test("release manifest contains only owned Mac and Windows update URLs", () => fixture((dir) => {
  const result = invoke(dir);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8"));
  assert.equal(manifest.version, version);
  assert.deepEqual(Object.keys(manifest.platforms), ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"]);
  for (const platform of Object.values(manifest.platforms)) {
    assert.ok(platform.url.startsWith(`https://github.com/rubengarciajr/oh-my-awakenbot/releases/download/awakenbot-v${version}/`));
    assert.equal(platform.signature, "test-signature");
  }
}));

test("release refuses a missing bundle, empty signature, or mismatched tag", () => fixture((dir) => {
  const wrongTag = invoke(dir, "awakenbot-v99.0.0");
  assert.notEqual(wrongTag.status, 0);
  assert.match(wrongTag.stderr, /Expected: release-manifest/);
  writeFileSync(join(dir, names[0] + ".sig"), "");
  const unsigned = invoke(dir);
  assert.notEqual(unsigned.status, 0);
  assert.match(unsigned.stderr, /Empty signature/);
  writeFileSync(join(dir, names[0] + ".sig"), "test-signature");
  rmSync(join(dir, names[0]));
  const missing = invoke(dir);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Missing update bundle/);
}));

test("promotion verifies a reviewed manifest without rewriting it and rejects changed URLs", () => fixture((dir) => {
  assert.equal(invoke(dir).status, 0);
  const path = join(dir, "latest.json");
  const before = readFileSync(path, "utf8");
  assert.equal(invoke(dir, `awakenbot-v${version}`, "--verify").status, 0);
  assert.equal(readFileSync(path, "utf8"), before);
  const changed = JSON.parse(before);
  changed.platforms["windows-x86_64"].url = "https://example.com/replaced.exe";
  writeFileSync(path, JSON.stringify(changed));
  const result = invoke(dir, `awakenbot-v${version}`, "--verify");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Draft manifest differs/);
}));
