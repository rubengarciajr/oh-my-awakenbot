import { expect, test } from "@playwright/test";
test.use({ colorScheme: "dark" });

test("bot loading shows a centered sharp orb over the blurred whole window, then clears on connection", async ({ page }) => {
  let release: (() => void) | undefined;
  await page.routeWebSocket(/127\.0\.0\.1/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const f = JSON.parse(String(raw));
      if (f.op === "chat.open" && f.bot === "kami") release = () => server.send(raw);
      else server.send(raw);
    });
    server.onMessage((raw) => ws.send(raw));
  });
  await page.goto("/");
  const overlay = page.getByTestId("account-loading");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("role", "status");
  const orb = overlay.locator(".orb-mark");
  const box = await orb.boundingBox();
  expect(box?.width).toBe(300);
  expect(box?.height).toBe(300);
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + 150 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box!.y + 150 - viewport.height / 2)).toBeLessThan(2);
  const blur = await overlay.evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(blur).toContain("blur(10px)");
  const area = await overlay.boundingBox();
  expect(area).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  await expect(overlay).toContainText("Loading");
  const dotCountAt = (ms: number) => overlay.locator(".account-loading-dots i").evaluateAll((els, time) => {
    for (const el of els) for (const animation of el.getAnimations()) { animation.pause(); animation.currentTime = time; }
    return els.filter((el) => Number(getComputedStyle(el).opacity) > .5).length;
  }, ms);
  expect(await dotCountAt(500)).toBe(1);
  expect(await dotCountAt(900)).toBe(2);
  expect(await dotCountAt(1300)).toBe(3);
  expect(await orb.locator("img").evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");
  await page.screenshot({ path: "/tmp/awaken-account-loading.png" });
  expect(release).toBeDefined();
  release!();
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId("composer")).toBeEnabled();
});

test("permanent connection failures retain their actionable error without a loading veil", async ({ page }) => {
  await page.routeWebSocket(/127\.0\.0\.1/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const f = JSON.parse(String(raw));
      if (f.op === "chat.open" && f.bot === "kami") ws.send(JSON.stringify({ id: f.id, ok: false,
        error: { code: "gateway_unavailable", message: "Profile access is refused" } }));
      else server.send(raw);
    });
    server.onMessage((raw) => ws.send(raw));
  });
  await page.goto("/");
  await expect(page.getByTestId("chat-error")).toContainText("Profile access is refused");
  await expect(page.getByTestId("account-loading")).toHaveCount(0);
});

test("loading respects reduced motion and keeps navigation available", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.routeWebSocket(/127\.0\.0\.1/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const f = JSON.parse(String(raw));
      if (f.op !== "chat.open") server.send(raw);
    });
    server.onMessage((raw) => ws.send(raw));
  });
  await page.goto("/");
  const overlay = page.getByTestId("account-loading");
  await expect(overlay).toBeVisible();
  expect(await overlay.locator(".orb-mark img").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.getByTestId("nav-settings").click();
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId("settings-view")).toBeVisible();
});
