import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const check = process.argv.includes("--check");
const copy = (source, destination, transform) => {
  const raw = readFileSync(new URL(source, import.meta.url));
  const normalize = (text) => text.replace(/\r\n/g, "\n");
  const expected = transform ? Buffer.from(transform(normalize(raw.toString("utf8")))) : raw;
  const path = new URL(destination, import.meta.url);
  if (check) {
    const actual = readFileSync(path);
    const comparable = transform ? Buffer.from(normalize(actual.toString("utf8"))) : actual;
    if (!comparable.equals(expected)) throw new Error(`Stale brand asset: ${path.pathname}`);
  } else writeFileSync(path, expected);
};
const still = (svg) => svg.replace(/<animate(?:Transform)?\b[^>]*?\/>/g, "");
// The approved scene is a landscape composition. Export the sphere separately so the
// app can fill every window with its backdrop without letterboxing or stretching it.
const orb = (svg, compact = false) => {
  const defsEnd = svg.indexOf("</defs>") + 7;
  const sphereStart = svg.indexOf('<g transform="translate(448 168) scale(1.5)">', defsEnd);
  const textStart = svg.lastIndexOf("<text ");
  if (sphereStart < 0 || textStart < 0) throw new Error("Approved orb scene structure changed");
  const defs = svg.slice(svg.indexOf("<defs>"), defsEnd);
  const haloStart = svg.indexOf('<circle cx="640" cy="360" r="278"', defsEnd);
  if (!compact && haloStart < 0) throw new Error("Approved orb halo missing");
  const body = compact ? svg.slice(sphereStart, textStart) : svg.slice(haloStart, textStart);
  const viewBox = compact ? "448 168 384 384" : "352 72 576 576";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="576" height="576" viewBox="${viewBox}">${defs}${body}</svg>\n`;
};
mkdirSync(new URL("../public/brand/", import.meta.url), { recursive: true });
copy("../../../brand/awaken-ice-orb.svg", "../src/assets/awaken-orb.svg");
copy("../../../brand/awaken-church.webp", "../src/assets/awaken-church.webp");
for (const theme of ["charcoal", "quiet-studio"]) {
  const source = `../../../brand/animation/background-studies/${theme}.svg`;
  copy(source, `../public/brand/splash-${theme}.svg`, (svg) => orb(svg));
  copy(source, `../public/brand/splash-${theme}-still.svg`, (svg) => still(orb(svg)));
}
const source = "../../../brand/animation/background-studies/charcoal.svg";
const slow = (svg) => orb(svg, true).replaceAll('dur="5s"', 'dur="20s"');
copy(source, "../public/brand/orb-slow.svg", slow);
copy(source, "../public/brand/orb-slow-still.svg", (svg) => still(slow(svg)));
console.log(check ? "Brand assets match their approved sources." : "Generated approved AWAKEN BOT assets.");
