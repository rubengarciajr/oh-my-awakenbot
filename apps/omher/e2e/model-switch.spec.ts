import { expect, test } from "@playwright/test";

test.beforeEach(async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${process.env.OMHER_MOCK_PORT || 5308}/?token=e2e`);
  await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = () => reject(new Error("mock unavailable")); });
  await new Promise<void>((resolve) => {
    ws.onmessage = (message) => { if (JSON.parse(String(message.data)).id === "model-reset") resolve(); };
    ws.send(JSON.stringify({ id: "model-reset", op: "mock.reset" }));
  });
  ws.close();
});

test("guarded model switches can be cancelled or confirmed inside the app", async ({ page }) => {
  let confirmed = 0;
  await page.routeWebSocket(/127\.0\.0\.1/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.op === "chat.set_model" && msg.model && !msg.confirm) {
        ws.send(JSON.stringify({ id: msg.id, ok: true, result: {
          model: "claude-opus-5-5", provider: "claude-proxy", reasoning: "high",
          confirmation: { token: "hermes-selection-token", message: "This model changes the cost of your next answer." },
        } }));
        return;
      }
      if (msg.op === "chat.set_model" && msg.confirm) {
        expect(msg.confirm).toBe("hermes-selection-token");
        confirmed++;
      }
      server.send(raw);
    });
  });
  await page.goto("/");
  await page.getByTestId("model-pill").click();
  const old = await page.getByTestId("model-label").textContent();
  const pick = page.getByTestId("model-opt").filter({ hasText: "gpt-6.1-terra" });
  await pick.click();
  await expect(page.getByTestId("model-confirmation")).toContainText("changes the cost");
  await expect(page.getByTestId("model-label")).toHaveText(old!);
  await page.getByTestId("model-cancel").click();
  expect(confirmed).toBe(0);
  await expect(page.getByTestId("model-confirmation")).toHaveCount(0);
  await pick.click();
  await page.getByTestId("model-confirm").click();
  await expect(page.getByTestId("model-label")).toHaveText("gpt-6.1-terra");
  expect(confirmed).toBe(1);
  await expect(page.getByTestId("model-confirmation")).toHaveCount(0);
});

test("a delayed confirmation for a previous bot never appears on the next bot", async ({ page }) => {
  let release: (() => void) | undefined;
  await page.routeWebSocket(/127\.0\.0\.1/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.op === "chat.set_model") {
        release = () => ws.send(JSON.stringify({ id: msg.id, ok: true, result: {
          model: "claude-opus-5-5", provider: "claude-proxy", reasoning: "high",
          confirmation: { token: "old-bot-token", message: "Only for the previous bot." },
        } }));
      } else server.send(raw);
    });
  });
  await page.goto("/");
  await page.getByTestId("model-pill").click();
  await page.getByTestId("model-opt").filter({ hasText: "gpt-6.1-terra" }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByTestId("bot-friren").click();
  release!();
  await page.getByTestId("model-pill").click();
  await expect(page.getByTestId("model-pop")).toBeVisible();
  await expect(page.getByTestId("model-confirmation")).toHaveCount(0);
});
