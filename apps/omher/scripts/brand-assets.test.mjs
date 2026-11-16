import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
test("brand verification accepts a Windows CRLF checkout and preserves binary logos", () => {
  const dir = mkdtempSync(join(tmpdir(), "awaken-brand-"));
  try {
    const sources = ["apps/omher/scripts/brand-assets.mjs", "brand/awaken-ice-orb.svg", "brand/awaken-church.webp", ...["charcoal", "quiet-studio"].map((theme) => `brand/animation/background-studies/${theme}.svg`)];
    for (const source of sources) {
      mkdirSync(dirname(join(dir, source)), { recursive: true });
      copyFileSync(join(repo, source), join(dir, source));
    }
    mkdirSync(join(dir, "apps/omher/src/assets"), { recursive: true });
    const script = join(dir, "apps/omher/scripts/brand-assets.mjs");
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(run().status, 0);
    const crlf = (folder) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) crlf(path);
        else if (path.endsWith(".svg")) writeFileSync(path, readFileSync(path, "utf8").replace(/\r?\n/g, "\r\n"));
      }
    };
    crlf(dir);
    const checked = run("--check");
    assert.equal(checked.status, 0, checked.stderr);
    const logo = join(dir, "apps/omher/src/assets/awaken-church.webp");
    writeFileSync(logo, Buffer.from("broken image"));
    assert.notEqual(run("--check").status, 0, "binary corruption must still be rejected");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
