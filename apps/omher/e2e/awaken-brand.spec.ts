import { expect, test } from "@playwright/test";

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
    await expect(splash.getByRole("img")).toHaveAttribute("src", /splash-.*\.svg$/);
    await page.clock.fastForward(4999);
    await expect(splash).toBeVisible();
    await page.clock.fastForward(1);
    await expect(splash).toHaveCount(0);
    await expect(page.getByTestId("sidebar")).toContainText("AWAKEN BOT");
    await expect(page).toHaveTitle("AWAKEN BOT");
  });
}

test("dark mode uses the AWAKEN off-black and off-white palette", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("sidebar")).toContainText("AWAKEN BOT");
  const colors = await page.locator("html").evaluate((el) => {
    const css = getComputedStyle(el);
    return ["--bg", "--side", "--ink", "--body"].map((name) => css.getPropertyValue(name).trim());
  });
  expect(colors).toEqual(["#111214", "#17181b", "#f3f1ec", "#d8d6d0"]);
});
