import { expect, test } from "@playwright/test";

test("opens recent rows, loads older rows upward, and keeps the reading position and live reply", async ({ page }) => {
  let pages = 0;
  const writes: string[] = [];
  const stamp = Date.now() / 1000;
  const messages = Array.from({ length: 120 }, (_, i) => ({ id: `history-${i}`, role: i % 2 ? "assistant" : "user",
    text: `Saved message ${i}. A synthetic conversation row for testing the reading position.`, ts: stamp - 240 + i,
    ...(i === 119 ? { truncated: true } : {}) }));
  await page.routeWebSocket(/127\.0\.0\.1/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const f = JSON.parse(String(raw));
      if (["chat.send", "chat.set_model", "chat.interrupt"].includes(f.op)) writes.push(f.op);
      if (f.op === "elsewhere.list" && f.bot === "kami") {
        ws.send(JSON.stringify({ id: f.id, ok: true, result: { sessions: [] } }));
      } else if (f.op === "routines.list" && f.bot === "kami") {
        ws.send(JSON.stringify({ id: f.id, ok: true, result: { routines: [] } }));
      } else if (f.op === "chat.open" && f.bot === "kami") {
        ws.send(JSON.stringify({ id: f.id, ok: true, result: { session_id: "owned", messages: messages.slice(60),
          running: false, model: "same-model", provider: "same-provider", reasoning: "high", history: { mode: "paged", cursor: "older" } } }));
      } else if (f.op === "chat.history") {
        pages++;
        setTimeout(() => ws.send(JSON.stringify({ id: f.id, ok: true, result: { session_id: "owned",
          messages: messages.slice(0, 61), next_cursor: null, reset: false } })), 150);
        // Events delivered while the older page loads must stay in the timeline.
        ws.send(JSON.stringify({ event: "turn.start", bot: "kami" }));
        ws.send(JSON.stringify({ event: "delta", bot: "kami", text: "Live reply stays visible" }));
      } else server.send(raw);
    });
    server.onMessage((raw) => ws.send(raw));
  });
  await page.goto("/");
  const timeline = page.getByTestId("timeline");
  await expect(timeline.locator('[data-item-id="history-119"]')).toBeVisible();
  await expect(timeline.locator('[data-item-id="history-119"]')).toContainText("Hermes keeps the complete saved message");
  expect(await timeline.locator('[data-item-id^="history-"]').count()).toBe(60);
  await timeline.evaluate((el) => { el.scrollTop = 45; });
  const anchor = timeline.locator('[data-item-id="history-60"]');
  const before = await anchor.evaluate((el) => el.getBoundingClientRect().top);
  await expect(timeline.locator('[data-item-id="history-0"]')).toHaveCount(1);
  const after = await anchor.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(after - before)).toBeLessThan(3);
  expect(await timeline.locator('[data-item-id^="history-"]').count()).toBe(120);
  await expect(timeline).toContainText("Live reply stays visible");
  expect(pages).toBe(1);
  expect(writes).toEqual([]);
  await expect(page.getByTestId("history-older")).toHaveCount(0);
});
