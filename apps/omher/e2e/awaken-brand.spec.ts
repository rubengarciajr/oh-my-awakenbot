import { expect, test } from "@playwright/test";

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
