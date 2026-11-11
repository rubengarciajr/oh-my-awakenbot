import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("omher.theme"));
});

test("native icon export keeps the bright ice orb instead of flattening it to black", async ({ page }) => {
  await page.goto("/");
  const pixel = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/src-tauri/icons/128x128.png";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(64, 42, 1, 1).data];
  });
  expect(pixel[0]).toBeGreaterThan(150);
  expect(pixel[1]).toBeGreaterThan(150);
  expect(pixel[2]).toBeGreaterThan(150);
  expect(pixel[3]).toBe(255);
});

for (const [random, theme] of [[0.1, "charcoal"], [0.9, "quiet-studio"]] as const) {
  test(`launch uses ${theme}, stays for five seconds, then reveals the app`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-11-11T12:00:00Z") });
    await page.clock.pauseAt(new Date("2026-11-11T12:00:01Z"));
    await page.addInitScript((value) => {
      Object.assign(window, { __AWAKEN_SPLASH__: true });
      Math.random = () => value;
    }, random);
    await page.goto("/");
    const splash = page.getByTestId("launch-screen");
    await expect(splash).toHaveAttribute("data-background", theme);
    await expect(splash.locator("img")).toHaveAttribute("src", /splash-.*\.svg$/);
    await page.clock.fastForward(4999);
    await expect(splash).toBeVisible();
    await page.clock.fastForward(1);
    await expect(splash).toHaveCount(0);
    await expect(page.getByTestId("sidebar").getByRole("img", { name: "Awaken Church" })).toBeVisible();
    await expect(page).toHaveTitle("Awaken Bot");
  });
}

test("dark mode uses the AWAKEN off-black and off-white palette", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("sidebar").getByRole("img", { name: "Awaken Church" })).toBeVisible();
  const colors = await page.locator("html").evaluate((el) => {
    const css = getComputedStyle(el);
    return ["--bg", "--side", "--ink", "--body"].map((name) => css.getPropertyValue(name).trim());
  });
  expect(colors).toEqual(["#111214", "#17181b", "#f3f1ec", "#d8d6d0"]);
});

test("a fresh install stays dark on a light OS and keeps pale chips readable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("nav-settings").click();
  await expect(page.locator(".ap-pv-chip")).toHaveCSS("color", "rgb(12, 12, 14)");
  await expect(page.locator(".ap-pv-send")).toHaveCSS("color", "rgb(12, 12, 14)");
});

test("launch fills a tall window without stretching the circular orb", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.clock.install();
  await page.addInitScript(() => Object.assign(window, { __AWAKEN_SPLASH__: true }));
  await page.goto("/");
  const splash = page.getByTestId("launch-screen");
  await expect(splash).toBeVisible();
  const frame = await splash.boundingBox();
  expect(frame).toMatchObject({ x: 0, y: 0, width: 900, height: 1100 });
  const orb = await splash.locator(".launch-orb").boundingBox();
  expect(orb).not.toBeNull();
  expect(orb!.width).toBeCloseTo(orb!.height, 0);
  await expect(splash.getByText("AWAKEN BOT")).toBeVisible();
  mkdirSync("e2e/__shots__", { recursive: true });
  await page.screenshot({ path: "e2e/__shots__/awaken-launch-tall.png" });
});

test("corner uses the church wordmark and a slower morphing orb", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByTestId("sidebar").getByRole("img", { name: "Awaken Church" })).toBeVisible();
  await expect(page.locator(".brand .orb-mark img")).toHaveAttribute("src", "/brand/orb-slow.svg");
  const orb = await request.get("/brand/orb-slow.svg");
  const svg = await orb.text();
  expect(svg).toContain('dur="20s"');
  expect(svg).not.toContain('dur="5s"');
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.locator(".brand .orb-mark img").evaluate((img) => (img as HTMLImageElement).currentSrc)).toContain("orb-slow-still.svg");
});

test("church wordmark retains the original artwork ratio at readable size", async ({ page }) => {
  await page.goto("/");
  const logo = page.getByTestId("sidebar").getByRole("img", { name: "Awaken Church" });
  const size = await logo.evaluate((el) => {
    const img = el as HTMLImageElement;
    const box = img.getBoundingClientRect();
    return { natural: img.naturalWidth / img.naturalHeight, ratio: box.width / box.height, height: box.height };
  });
  expect(size.natural).toBeCloseTo(1039 / 119, 4);
  expect(size.ratio).toBeCloseTo(size.natural, 2);
  expect(size.height).toBeGreaterThanOrEqual(18);
  const artwork = await logo.boundingBox();
  const add = await page.getByRole("button", { name: "Add a bot", exact: true }).boundingBox();
  expect(artwork!.x + artwork!.width).toBeLessThanOrEqual(add!.x);
  mkdirSync("e2e/__shots__", { recursive: true });
  await page.locator(".side-top").screenshot({ path: "e2e/__shots__/awaken-church-header.png", animations: "allow" });
});
