import { expect, test } from "@playwright/test";

test.beforeEach(async () => {
  const port = Number(process.env.OMHER_MOCK_PORT || 5308);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=e2e`);
  await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = reject; });
  const reset = new Promise<void>((resolve) => { ws.onmessage = (event) => {
    if (JSON.parse(String(event.data)).id === "reset") resolve();
  }; });
  ws.send(JSON.stringify({ id: "reset", op: "mock.reset" }));
  await reset;
  ws.close();
});

test("a starting Hermes bot connects automatically and permits no send while waiting", async ({ page }) => {
  let opens = 0;
  let sends = 0;
  await page.routeWebSocket(/127\.0\.0\.1/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const frame = JSON.parse(String(raw));
      if (frame.op === "chat.send") sends++;
      if (frame.op === "chat.open" && frame.bot === "kami" && ++opens === 1) {
        ws.send(JSON.stringify({ id: frame.id, ok: false, error: { code: "gateway_starting", message: "Waiting for Hermes startup" } }));
      } else server.send(raw);
    });
    server.onMessage((raw) => ws.send(raw));
  });
  await page.goto("/");
  await expect(page.getByTestId("chat-starting")).toContainText("Hermes is starting…");
  await expect(page.getByTestId("bot-kami").getByTestId("bot-sub")).toHaveText("Hermes is starting…");
  await expect(page.getByTestId("composer")).toBeDisabled();
  await expect(page.getByTestId("composer")).toHaveAttribute("placeholder", "Hermes is starting…");
  await expect(page.getByTestId("chat-error")).toHaveCount(0);
  await expect(page.getByTestId("chat-starting")).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByTestId("bubble-user").first()).toBeVisible();
  await expect(page.getByTestId("composer")).toBeEnabled();
  await expect(page.getByTestId("bot-kami")).toHaveAttribute("aria-current", "true");
  expect(opens).toBe(2);
  expect(sends).toBe(0);
});
