import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore, type BridgeLike } from "./store";
import type { BridgeEvent, ChatOpenResult } from "../lib/protocol";
import type { BridgeStatus } from "../lib/bridge";

const ready = (): ChatOpenResult => ({ session_id: "same-session", messages: [{ id: "saved", role: "assistant", text: "Saved answer", ts: 1 }],
  running: false, model: "existing-model", provider: "existing-provider", reasoning: "high" });

function fixture() {
  let status: (s: BridgeStatus) => void = () => {};
  let event: (e: BridgeEvent) => void = () => {};
  const calls: { op: string; bot?: string }[] = [];
  const errors = new Map<string, string>();
  let pending: Promise<ChatOpenResult> | null = null;
  let metadata: Promise<never> | null = null;
  let loseSend = false;
  const bridge: BridgeLike = {
    connect: async () => status("open"),
    onStatus: (fn) => { status = fn; return () => {}; },
    onAny: (fn) => { event = fn; return () => {}; },
    request: (async (op: string, p: { bot?: string }) => {
      calls.push({ op, bot: p.bot });
      if (op === "hello") return { bridge: "mock", version: "1", hermes: { home: "/fixture" } };
      if (op === "bots.list") return { bots: ["first", "other"].map((name) => ({ name, display_name: name, is_default: false,
        model: "existing-model", provider: "existing-provider", description: "", status: name === "first" ? "online" : "offline", running: false })) };
      if (op === "chat.open") {
        const code = errors.get(p.bot!);
        if (code) throw { code, message: code === "gateway_starting" ? "Waiting for Hermes startup" : "Read failed" };
        return pending ?? ready();
      }
      if (op === "chat.send" && loseSend) throw { code: "disconnected", message: "Lost reply" };
      if (metadata && ["elsewhere.list", "models.options", "routines.list"].includes(op)) return metadata;
      if (op === "elsewhere.list") return { sessions: [] };
      if (op === "routines.list") return { routines: [] };
      if (op === "models.options") return { providers: [], current: { model: "existing-model", provider: "existing-provider", reasoning: "high" }, reasoning_levels: [] };
      return {};
    }) as BridgeLike["request"],
  };
  return { bridge, calls, errors, status: (s: BridgeStatus) => status(s), event: (e: BridgeEvent) => event(e),
    pending: (p: Promise<ChatOpenResult> | null) => { pending = p; }, metadata: () => { metadata = new Promise(() => {}); },
    loseSend: () => { loseSend = true; }, opens: (bot = "first") => calls.filter((c) => c.op === "chat.open" && c.bot === bot) };
}

afterEach(() => { vi.useRealTimers(); });

describe("selected bot startup and reconnect", () => {
  it("retries startup to ready without repicking, and never opens another offline profile", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.errors.set("first", "gateway_starting");
    const store = createStore(f.bridge);
    await store.actions.init();
    expect(store.getState().chats.first.openErrorCode).toBe("gateway_starting");
    expect(store.getState().bots[0].status).toBe("starting");
    expect(f.opens("other")).toHaveLength(0);
    f.errors.delete("first");
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.opens()).toHaveLength(2);
    expect(store.getState().chats.first).toMatchObject({ sessionId: "same-session", openError: null, openErrorCode: null, model: "existing-model" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("deduplicates concurrent opens for one bot", async () => {
    const f = fixture();
    const store = createStore(f.bridge);
    await store.actions.init();
    let settle!: (value: ChatOpenResult) => void;
    f.pending(new Promise((resolve) => { settle = resolve; }));
    const first = store.actions.selectBot("other");
    const second = store.actions.selectBot("other");
    expect(f.opens("other")).toHaveLength(1);
    settle(ready());
    await Promise.all([first, second]);
  });

  it("a lost send reply reconnects by reading, preserving messages and never resending", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const store = createStore(f.bridge);
    await store.actions.init();
    f.loseSend();
    await store.actions.send("Submit once");
    f.status("closed");
    const before = store.getState().chats.first.messages;
    f.errors.set("first", "timeout");
    f.status("open");
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().chats.first.messages).toEqual(before);
    f.errors.delete("first");
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.getState().chats.first.openError).toBeNull();
    expect(f.calls.filter((c) => c.op === "chat.send")).toHaveLength(1);
    expect(f.calls.some((c) => ["chat.set_model", "session.create", "session.reset"].includes(c.op))).toBe(false);
  });

  it("switching bots cancels stale retries and bridge closure leaves no timer or request", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.errors.set("first", "gateway_starting");
    const store = createStore(f.bridge);
    await store.actions.init();
    await store.actions.selectBot("other");
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.opens()).toHaveLength(1);
    f.errors.set("other", "bot_offline");
    f.status("closed"); f.status("open");
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    f.status("closed");
    const count = f.calls.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.calls).toHaveLength(count);
  });

  it("semantic errors do not retry, and pending metadata cannot hold the selected chat", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.metadata();
    const store = createStore(f.bridge);
    await store.actions.init();
    expect(store.getState().chats.first.sessionId).toBe("same-session");
    f.errors.set("other", "unknown_bot");
    await store.actions.selectBot("other");
    await vi.advanceTimersByTimeAsync(120000);
    expect(f.opens("other")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an observed online event recovers startup immediately without waiting for the timer", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.errors.set("first", "gateway_starting");
    const store = createStore(f.bridge);
    await store.actions.init();
    f.errors.delete("first");
    f.event({ event: "bot.status", bot: "first", status: "online", running: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().chats.first.openError).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(f.opens()).toHaveLength(2);
  });

  it("caps startup backoff at ten seconds and keeps only one timer", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.errors.set("first", "gateway_starting");
    const store = createStore(f.bridge);
    await store.actions.init();
    let count = 1;
    for (const delay of [2000, 4000, 8000, 10000, 10000]) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(f.opens()).toHaveLength(count);
      await vi.advanceTimersByTimeAsync(1);
      expect(f.opens()).toHaveLength(++count);
      expect(vi.getTimerCount()).toBe(1);
    }
    f.status("closed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a stale pending read cannot replace the recovered chat after reconnect", async () => {
    vi.useFakeTimers();
    const f = fixture();
    let old!: (r: ChatOpenResult) => void;
    f.pending(new Promise((resolve) => { old = resolve; }));
    const store = createStore(f.bridge);
    const init = store.actions.init();
    await vi.advanceTimersByTimeAsync(0);
    f.status("closed");
    f.pending(null);
    f.status("open");
    await vi.advanceTimersByTimeAsync(0);
    old({ ...ready(), model: "stale-model" });
    await init;
    expect(store.getState().chats.first.model).toBe("existing-model");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a semantic refusal cancels a previous startup retry", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.errors.set("first", "gateway_starting");
    const store = createStore(f.bridge);
    await store.actions.init();
    expect(vi.getTimerCount()).toBe(1);
    f.errors.set("first", "unknown_bot");
    await store.actions.selectBot("first");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.opens()).toHaveLength(2);
  });

  it("does not send or attach a message while Hermes is starting", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.errors.set("first", "gateway_starting");
    const store = createStore(f.bridge);
    await store.actions.init();
    await store.actions.send("Wait for startup");
    await store.actions.sendWithFiles("Wait for startup", [{ name: "picture.png", size: 1, kind: "file", url: null, attach: "image",
      read: async () => { throw new Error("A starting bot must not read the attachment"); } }]);
    expect(f.calls.some((c) => c.op === "chat.send" || c.op === "chat.attach")).toBe(false);
    expect(store.getState().chats.first.items).toHaveLength(0);
    f.status("closed");
  });
});
