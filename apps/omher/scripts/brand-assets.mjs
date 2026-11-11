import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const check = process.argv.includes("--check");
const copy = (source, destination, transform = (text) => text) => {
  const expected = transform(readFileSync(new URL(source, import.meta.url), "utf8"));
  const path = new URL(destination, import.meta.url);
  if (check) {
    if (readFileSync(path, "utf8") !== expected) throw new Error(`Stale brand asset: ${path.pathname}`);
  } else writeFileSync(path, expected);
};
mkdirSync(new URL("../public/brand/", import.meta.url), { recursive: true });
copy("../../../brand/awaken-ice-orb.svg", "../src/assets/awaken-orb.svg");
for (const theme of ["charcoal", "quiet-studio"]) {
  const source = `../../../brand/animation/background-studies/${theme}.svg`;
  copy(source, `../public/brand/splash-${theme}.svg`);
  copy(source, `../public/brand/splash-${theme}-still.svg`, (svg) => svg.replace(/<animate(?:Transform)?\b[^>]*?\/>/g, ""));
}
console.log(check ? "Brand assets match their approved sources." : "Generated approved AWAKEN BOT assets.");
