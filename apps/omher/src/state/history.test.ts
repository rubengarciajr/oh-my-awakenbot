import { describe, expect, it } from "vitest";
import { initialState, reduce, type Action } from "./store";
import type { ChatOpenResult } from "../lib/protocol";

const recent: ChatOpenResult = {
  session_id: "owned", messages: [{ id: "20", role: "assistant", text: "recent", ts: 20 }],
  running: false, model: "unchanged", provider: "same", reasoning: "high",
  history: { mode: "paged", cursor: "older" },
};
const opened = () => reduce(initialState(), { type: "chat.opened", bot: "kami", res: recent, now: 20000 });
const history = (over = {}): Action => ({ type: "chat.history", bot: "kami", sessionId: "owned", cursor: "older", window: 1,
  res: { session_id: "owned", messages: [{ id: "10", role: "user", text: "earlier", ts: 10 }, recent.messages[0]], next_cursor: null, reset: false, ...over } });

describe("recent-first saved display window", () => {
  it("prepends by durable identity without duplicating an overlapping boundary or touching a live turn", () => {
    let s = opened();
    s = reduce(s, { type: "event", ev: { event: "turn.start", bot: "kami" }, now: 21000 });
    s = reduce(s, { type: "event", ev: { event: "delta", bot: "kami", text: "live output" }, now: 22000 });
    const live = s.chats.kami.turn;
    s = reduce(s, history());
    expect(s.chats.kami.messages.map((m) => m.id)).toEqual(["10", "20"]);
    expect(s.chats.kami.turn).toBe(live);
    expect(s.chats.kami).toMatchObject({ model: "unchanged", provider: "same", reasoning: "high", history: { cursor: null, loading: false } });
  });

  it("rejects stale page replies after a new window opens, even for the same session", () => {
    const s = reduce(opened(), { type: "chat.opened", bot: "kami", res: { ...recent, history: { mode: "paged", cursor: "fresh" } }, now: 23000 });
    expect(reduce(s, history()).chats.kami).toBe(s.chats.kami);
  });

  it("cursor resets replace saved messages while preserving local input and approval cards", () => {
    let s = opened();
    s = reduce(s, { type: "local.user", bot: "kami", id: "local-1", text: "new input", now: 21000 });
    s = reduce(s, { type: "event", ev: { event: "approval.request", bot: "kami", request_id: "approve", title: "Allow", command: "fixed", choices: ["once"] }, now: 22000 });
    s = reduce(s, history({ reset: true, messages: [{ id: "30", role: "assistant", text: "new window", ts: 30 }] }));
    expect(s.chats.kami.messages.map((m) => m.id)).toEqual(["local-1", "30"]);
    expect(s.chats.kami.items.some((i) => i.kind === "approval")).toBe(true);
  });

  it("cursor resets reconcile local twins and merge newer saved rows around completed live replies", () => {
    let s = opened();
    const files = [{ name: "test.png", size: 12, kind: "image" as const, url: "blob:synthetic" }];
    s = reduce(s, { type: "local.user", bot: "kami", id: "local-1", text: "as typed", sent: "wire prompt", files, now: 21000 });
    s = reduce(s, { type: "event", ev: { event: "message", bot: "kami", id: "30", text: "live completed reply" }, now: 30000 });
    s = reduce(s, history({ reset: true, messages: [
      { id: "25", role: "user", text: "wire prompt", ts: 21 },
      { id: "30", role: "assistant", text: "live completed reply", ts: 30 },
      { id: "35", role: "user", text: "newer saved row", ts: 35 },
    ] }));
    expect(s.chats.kami.messages.map((m) => m.id)).toEqual(["25", "30", "35"]);
    expect(s.chats.kami.items.find((i) => i.id === "25")).toMatchObject({ text: "as typed", sent: "wire prompt", files });
  });
});
