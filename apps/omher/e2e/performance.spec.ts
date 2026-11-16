import { expect, test } from "@playwright/test";

test("response measurements are local reads, show unknown stages honestly, and refresh on request", async ({ page }) => {
  let reads = 0;
  const writes: string[] = [];
  await page.routeWebSocket(/127\.0\.0\.1/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const f = JSON.parse(String(raw));
      if (["chat.send", "chat.set_model", "chat.interrupt"].includes(f.op)) writes.push(f.op);
      if (f.op === "performance.read") {
        reads++;
        ws.send(JSON.stringify({ id: f.id, ok: true, result: { version: 1, storage: "memory", limit: 30,
          recent: [{ trace_id: "synthetic", status: "done", bridge_prepare_ms: 12, submit_ack_ms: 20,
            turn_start_ms: 40, first_progress_ms: 150, first_text_ms: 250, total_ms: 800,
            tools_ms: 0, provider_ms: reads > 1 ? 600 : null, provider_first_chunk_ms: null, provider_calls: reads > 1 ? 1 : 0 }] } }));
      } else server.send(raw);
    });
    server.onMessage((raw) => ws.send(raw));
  });
  await page.goto("/");
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-nav-computer").click();
  const panel = page.getByTestId("reply-performance");
  await expect(panel).toContainText("0.25 s");
  await expect(panel).toContainText("Not observed");
  await expect(panel).toContainText("0.00 s");
  expect(reads).toBe(1);
  await panel.getByRole("button", { name: "Refresh" }).click();
  await expect(panel).toContainText("0.60 s");
  expect(reads).toBe(2);
  expect(writes).toEqual([]);
});

test("measures renderer delivery for a correlated reply received before the send acknowledgement", async ({ page }) => {
  let sends = 0;
  await page.routeWebSocket(/127\.0\.0\.1/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const f = JSON.parse(String(raw));
      if (f.op === "chat.send") {
        sends++;
        ws.send(JSON.stringify({ event: "turn.start", bot: f.bot }));
        setTimeout(() => ws.send(JSON.stringify({ event: "delta", bot: f.bot, admission_id: "measured-admission", text: "Synthetic measured reply" })), 20);
        setTimeout(() => {
          ws.send(JSON.stringify({ id: f.id, ok: true, result: { input_id: "synthetic-input", trace_id: "measured-trace", admission_id: "measured-admission" } }));
          ws.send(JSON.stringify({ event: "message", bot: f.bot, admission_id: "measured-admission", id: "synthetic-answer", text: "Synthetic measured reply" }));
          ws.send(JSON.stringify({ event: "turn.end", bot: f.bot, outcome: "done" }));
        }, 60);
      } else if (f.op === "performance.read") {
        ws.send(JSON.stringify({ id: f.id, ok: true, result: { version: 1, storage: "memory", limit: 30,
          recent: [{ trace_id: "measured-trace", status: "done", bridge_prepare_ms: 1, submit_ack_ms: 60,
            turn_start_ms: 2, first_progress_ms: 20, first_text_ms: 20, total_ms: 60,
            tools_ms: 0, provider_ms: 40, provider_first_chunk_ms: 15, provider_calls: 1 }] } }));
      } else server.send(raw);
    });
    server.onMessage((raw) => ws.send(raw));
  });
  await page.goto("/");
  await expect(page.getByTestId("composer")).toBeEnabled();
  await page.getByTestId("composer").fill("Synthetic delivery test");
  await page.getByTestId("composer").press("Enter");
  await expect(page.getByTestId("timeline")).toContainText("Synthetic measured reply");
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-nav-computer").click();
  const panel = page.getByTestId("reply-performance");
  const first = panel.locator(".reply-performance-value").filter({ has: page.getByText("First reply received", { exact: true }) }).locator("dd");
  const ack = panel.locator(".reply-performance-value").filter({ has: page.getByText("App acknowledgement", { exact: true }) }).locator("dd");
  await expect(first).toHaveText(/\d+\.\d{2} s/);
  await expect(ack).toHaveText(/\d+\.\d{2} s/);
  expect(Number.parseFloat(await ack.innerText())).toBeGreaterThanOrEqual(Number.parseFloat(await first.innerText()));
  expect(sends).toBe(1);
});
