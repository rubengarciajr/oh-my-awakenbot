import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [directory, repository, tag] = process.argv.slice(2);
const version = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")).version;
if (!directory || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") || tag !== `awakenbot-v${version}`) {
  throw new Error("Expected: release-manifest.mjs <artifact-directory> <owner/repo> awakenbot-v<app-version>");
}
const files = {
  "darwin-aarch64": `awaken-bot-${version}-macos-arm64.app.tar.gz`,
  "darwin-x86_64": `awaken-bot-${version}-macos-x64.app.tar.gz`,
  "windows-x86_64": `awaken-bot-${version}-windows-x64-setup.exe`,
};
const platforms = {};
for (const [platform, file] of Object.entries(files)) {
  if (!existsSync(join(directory, file))) throw new Error(`Missing update bundle: ${file}`);
  const signature = readFileSync(join(directory, `${file}.sig`), "utf8").trim();
  if (!signature) throw new Error(`Empty signature: ${file}.sig`);
  platforms[platform] = { signature, url: `https://github.com/${repository}/releases/download/${tag}/${file}` };
}
if (process.argv.includes("--verify")) {
  const existing = JSON.parse(readFileSync(join(directory, "latest.json"), "utf8"));
  if (existing.version !== version || JSON.stringify(existing.platforms) !== JSON.stringify(platforms)) {
    throw new Error("Draft manifest differs from its signed bundles or release tag");
  }
  console.log(`Verified reviewed update manifest for AWAKEN BOT ${version}.`);
} else {
  writeFileSync(join(directory, "latest.json"), JSON.stringify({
    version, notes: `AWAKEN BOT ${version}`, pub_date: new Date().toISOString(), platforms,
  }, null, 2) + "\n");
  console.log(`Created signed update manifest for AWAKEN BOT ${version} (macOS and Windows).`);
}
