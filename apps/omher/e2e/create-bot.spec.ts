import { test, expect, type Page } from "@playwright/test";

const port = Number(process.env.OMHER_MOCK_PORT || 5308);
async function mock(op: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=e2e`);
  await new Promise<void>((resolve) => { ws.onopen = () => resolve(); });
  const reply = new Promise<any>((resolve) => { ws.onmessage = (event) => {
    const result = JSON.parse(String(event.data));
    if (result.id === "test") resolve(result.result);
  }; });
  ws.send(JSON.stringify({ id: "test", op }));
  const result = await reply;
  ws.close();
  return result;
}
async function form(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("bot-kami")).toBeVisible();
  await page.getByRole("button", { name: "Add a bot", exact: true }).click();
  await page.getByTestId("addbot-create").click();
  return page.getByTestId("createbot-form");
}
test.beforeEach(async () => { await mock("mock.reset"); });

test("creates a separate bot in the app and opens its empty chat", async ({ page }) => {
  const f = await form(page);
  expect((await mock("mock.calls")).calls.some((c: any) => c.op === "bots.create")).toBe(false);
  await f.getByLabel("Bot name", { exact: true }).fill("Sermon Helper");
  await expect(f.getByLabel("Bot ID", { exact: true })).toHaveValue("sermon-helper");
  await f.getByLabel("Use settings from", { exact: true }).selectOption("friren");
  await f.getByLabel("Description (optional)", { exact: true }).fill("Sunday preparation");
  await f.getByLabel("Personality and instructions (optional)", { exact: true }).fill("Use source-backed answers.");
  expect((await mock("mock.calls")).calls.some((c: any) => c.op === "bots.create")).toBe(false);
  await f.getByRole("button", { name: "Create a bot", exact: true }).click();
  await expect(f).toHaveCount(0);
  await expect(page.getByTestId("bot-sermon-helper")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("bubble-user")).toHaveCount(0);
  await expect(page.getByTestId("model-pill")).toContainText("Sonnet 5.5");
  const creates = (await mock("mock.calls")).calls.filter((c: any) => c.op === "bots.create");
  expect(creates).toHaveLength(1);
  expect(creates[0].params).toMatchObject({ name: "sermon-helper", display_name: "Sermon Helper", source: "friren",
    description: "Sunday preparation", soul: "Use source-backed answers." });
});

test("validates duplicate and unsafe IDs without dispatching creation", async ({ page }) => {
  const f = await form(page);
  await f.getByLabel("Bot name", { exact: true }).fill("Kami");
  await expect(f).toContainText("That bot ID already exists.");
  await expect(f.getByRole("button", { name: "Create a bot", exact: true })).toBeDisabled();
  await f.getByLabel("Bot ID", { exact: true }).fill("../escape");
  await expect(f.getByRole("button", { name: "Create a bot", exact: true })).toBeDisabled();
  await f.getByRole("button", { name: "Back", exact: true }).click();
  expect((await mock("mock.calls")).calls.some((c: any) => c.op === "bots.create")).toBe(false);
});

test("shows a server refusal inline and preserves the form for correction", async ({ page }) => {
  await page.routeWebSocket(/127\.0\.0\.1/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const frame = JSON.parse(String(raw));
      if (frame.op === "bots.create") {
        ws.send(JSON.stringify({ id: frame.id, ok: false, error: { code: "already_exists", message: "That bot ID already exists." } }));
      } else server.send(raw);
    });
    server.onMessage((raw) => ws.send(raw));
  });
  const f = await form(page);
  await f.getByLabel("Bot name", { exact: true }).fill("Sermon Helper");
  await f.getByRole("button", { name: "Create a bot", exact: true }).click();
  await expect(f.getByRole("alert")).toHaveText("That bot ID already exists.");
  await expect(f.getByLabel("Bot name", { exact: true })).toHaveValue("Sermon Helper");
});
