import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

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
const invoke = (dir, tag = `awakenbot-v${version}`) => spawnSync(process.execPath, [script.pathname, dir, "rubengarciajr/oh-my-awakenbot", tag], { encoding: "utf8" });

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
  assert.notEqual(invoke(dir, "awakenbot-v99.0.0").status, 0);
  writeFileSync(join(dir, names[0] + ".sig"), "");
  assert.notEqual(invoke(dir).status, 0);
  writeFileSync(join(dir, names[0] + ".sig"), "test-signature");
  rmSync(join(dir, names[0]));
  assert.notEqual(invoke(dir).status, 0);
}));
