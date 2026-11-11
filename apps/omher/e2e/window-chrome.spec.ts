import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("native window removes decorations and grants only the needed window actions", () => {
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const capability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));
  expect(config.productName).toBe("Awaken Bot");
  expect(config.app.windows[0]).toMatchObject({ decorations: false, title: "Awaken Bot", backgroundColor: "#111214" });
  expect(capability.windows).toEqual(["main"]);
  expect(capability.permissions.filter((permission: string) => permission.startsWith("core:window:"))).toEqual([
    "core:window:allow-close", "core:window:allow-minimize",
    "core:window:allow-toggle-maximize", "core:window:allow-start-dragging",
  ]);
});

test("ordinary browser preview has no native window controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await expect(page.getByTestId("window-chrome")).toHaveCount(0);
});

for (const platform of ["mac", "windows"] as const) {
  test(`${platform} controls remain usable through launch and setup`, async ({ page }) => {
    await page.clock.install();
    await page.addInitScript((platform) => {
      localStorage.setItem("omher.lang", "en");
      localStorage.setItem("omher.theme", "dark");
      Object.defineProperty(navigator, "userAgent", {
        value: platform === "mac" ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      });
      const calls: string[] = [];
      let maximized = false;
      Object.assign(window, {
        __AWAKEN_SPLASH__: true,
        __WINDOW_CALLS__: calls,
        __AWAKEN_DESKTOP__: {
          minimize: async () => { calls.push("minimize"); },
          toggleMaximize: async () => { calls.push("toggleMaximize"); maximized = !maximized; },
          close: async () => { calls.push("close"); },
          isMaximized: async () => maximized,
          onResized: async () => () => {},
        },
        __OMHER_GATE__: {
          status: async () => ({ state: "failed", missing: "hermes" }),
          installCommand: async () => "install-hermes",
          retry: async () => {},
        },
      });
    }, platform);
    await page.goto("/");
    const chrome = page.getByTestId("window-chrome");
    const splash = page.getByTestId("launch-screen");
    await expect(chrome).toBeVisible();
    await expect(chrome).toHaveCSS("background-color", "rgb(17, 18, 20)");
    await expect(chrome.locator("[data-tauri-drag-region]").first()).toBeVisible();
    await expect(splash).toBeVisible();
    expect(await splash.boundingBox()).toMatchObject({ x: 0, y: 36, width: 1280, height: 784 });
    await page.screenshot({ path: `e2e/__shots__/awaken-launch-window-${platform}.png` });
    expect(await chrome.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))))
      .toEqual(platform === "mac"
        ? ["Close window", "Minimize window", "Maximize window"]
        : ["Minimize window", "Maximize window", "Close window"]);
    await chrome.getByRole("button", { name: "Minimize window" }).click();
    await chrome.getByRole("button", { name: "Maximize window" }).click();
    await expect(chrome.getByRole("button", { name: "Restore window" })).toBeVisible();
    await chrome.getByRole("button", { name: "Restore window" }).click();
    await chrome.getByRole("button", { name: "Maximize window" }).focus();
    await page.keyboard.press("Enter");
    await expect(chrome.getByRole("button", { name: "Restore window" })).toBeFocused();
    await page.clock.fastForward(5000);
    await expect(splash).toHaveCount(0);
    await expect(page.getByTestId("setup-screen")).toBeVisible();
    await chrome.getByRole("button", { name: "Close window" }).click();
    const calls = await page.evaluate(() => (window as unknown as { __WINDOW_CALLS__: string[] }).__WINDOW_CALLS__);
    expect(calls).toEqual(["minimize", "toggleMaximize", "toggleMaximize", "toggleMaximize", "close"]);
    await page.screenshot({ path: `e2e/__shots__/awaken-window-${platform}.png` });
  });
}
