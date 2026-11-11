import { expect, test, type Page } from "@playwright/test";

const MOCK = Number(process.env.OMHER_MOCK_PORT || 5308);

async function mock(op: string, params: Record<string, unknown> = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${MOCK}/?token=e2e`);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("mock websocket error"));
  });
  const reply = await new Promise<{ ok: boolean }>((resolve) => {
    ws.onmessage = (message) => {
      const result = JSON.parse(String(message.data));
      if (result.id === "visibility") resolve(result);
    };
    ws.send(JSON.stringify({ id: "visibility", op, ...params }));
  });
  ws.close();
  expect(reply.ok).toBe(true);
}

const emit = (...events: Record<string, unknown>[]) => mock("mock.emit", { events });
const ev = (event: string, extra: Record<string, unknown> = {}) => ({ bot: "kami", event, ...extra });

async function visibility(page: Page, hidden: boolean) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: hidden ? "hidden" : "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
  await expect(page.locator("html")).toHaveAttribute("data-visual-active", String(!hidden));
}

test.beforeEach(async () => { await mock("mock.reset"); });

test("hidden workspace stops visual clocks and SVG motion while chat events remain live", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-11T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-11T12:00:01Z"));
  await page.goto("/");
  await expect(page.getByTestId("bot-kami")).toHaveAttribute("aria-current", "true");
  await emit(ev("turn.start"), ev("tool.start", { tool_id: "visible-clock", name: "read_file", detail: "README.md" }));
  const elapsed = page.locator('[data-testid="activity"][data-state="live"]').getByTestId("activity-elapsed");
  await expect(elapsed).toHaveText("0s");
  await page.clock.fastForward(2000);
  await expect(elapsed).toHaveText("2s");
  const orb = page.locator(".brand .orb-mark img");
  await expect(orb).toHaveAttribute("src", "/brand/orb-slow.svg");

  await visibility(page, true);
  await expect(orb).toHaveAttribute("src", "/brand/orb-slow-still.svg");
  await expect(orb).toHaveCSS("animation-play-state", "paused");
  await page.clock.fastForward(20_000);
  await expect(elapsed).toHaveText("2s");

  // Display timers resume from wall time, with no wait for their next interval.
  await visibility(page, false);
  await expect(elapsed).toHaveText("22s");
  await expect(orb).toHaveAttribute("src", "/brand/orb-slow.svg");
  await expect(orb).toHaveCSS("animation-play-state", "running");

  await visibility(page, true);
  await emit(ev("message", { text: "Delivered while the window was hidden.", ts: 1794398423 }), ev("turn.end", { outcome: "done" }));
  await expect(page.getByTestId("bubble-bot").last()).toContainText("Delivered while the window was hidden.");
  await expect(page.locator('[data-testid="activity"][data-state="live"]')).toHaveCount(0);
  await visibility(page, false);
  await expect(page.getByTestId("bubble-bot").last()).toContainText("Delivered while the window was hidden.");
  expect(errors).toEqual([]);
});

test("reduced motion stays still after hiding and restoring", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const orb = page.locator(".brand .orb-mark img");
  const selectedAsset = () => orb.evaluate((image) => (image as HTMLImageElement).currentSrc);
  await expect.poll(selectedAsset).toContain("orb-slow-still.svg");
  await visibility(page, true);
  await visibility(page, false);
  await expect.poll(selectedAsset).toContain("orb-slow-still.svg");
  await expect(orb).toHaveCSS("animation-name", "none");
});

test("hiding the intro uses still artwork without extending its five seconds", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-11T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-11T12:00:01Z"));
  await page.addInitScript(() => Object.assign(window, { __AWAKEN_SPLASH__: true }));
  await page.goto("/");
  const splash = page.getByTestId("launch-screen");
  await expect(splash).toBeVisible();
  await visibility(page, true);
  await expect(splash.locator("img")).toHaveAttribute("src", /-still\.svg$/);
  await page.clock.fastForward(4999);
  await expect(splash).toHaveCount(1);
  await page.clock.fastForward(1);
  await expect(splash).toHaveCount(0);
  await visibility(page, false);
  await expect(splash).toHaveCount(0);
});

test("native hide events stop motion when the WebView still reports visible", async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (event: { payload: boolean }) => void>();
    const handlers = new Map<string, number>();
    let next = 0;
    const now = new Date();
    localStorage.setItem("awaken.launch-intro-day", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback: (callback: (event: { payload: boolean }) => void) => { callbacks.set(++next, callback); return next; },
        invoke: async (command: string, args: { event?: string; handler?: number } = {}) => {
          if (command === "plugin:event|listen") { handlers.set(args.event!, args.handler!); return args.handler; }
          if (command === "plugin:window|is_visible") return true;
          if (command === "plugin:window|is_minimized") return false;
          return null;
        },
      },
      __OMHER_GATE__: { status: async () => ({ state: "failed", missing: "hermes" }), installCommand: async () => "install-hermes" },
      __NATIVE_VISIBILITY_FIXTURE__: (visible: boolean) => callbacks.get(handlers.get("awaken-window-visibility")!)?.({ payload: visible }),
    });
  });
  await page.goto("/");
  const orb = page.locator(".gate-mark img");
  await expect(orb).toHaveAttribute("src", "/brand/orb-slow.svg");
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  const nativeVisibility = (visible: boolean) => page.evaluate((visible) => {
    (window as unknown as { __NATIVE_VISIBILITY_FIXTURE__: (visible: boolean) => void }).__NATIVE_VISIBILITY_FIXTURE__(visible);
  }, visible);
  await nativeVisibility(false);
  await expect(orb).toHaveAttribute("src", "/brand/orb-slow-still.svg");
  await expect(page.locator("html")).toHaveAttribute("data-visual-active", "false");
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  await nativeVisibility(true);
  await expect(orb).toHaveAttribute("src", "/brand/orb-slow.svg");
  await expect(page.locator("html")).toHaveAttribute("data-visual-active", "true");
});
