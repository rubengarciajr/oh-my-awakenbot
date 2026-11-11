import { describe, expect, it } from "vitest";
import { initialState, reduce } from "../state/store";
import { accountIsLoading } from "./accountLoadingState";

const initial = () => ({ ...initialState(), conn: "open" as const, selectedBot: "one", bots: [{
  name: "one", display_name: "One", is_default: true, model: "same", provider: "same", description: "", status: "online" as const, running: false,
}] });
const ready = () => reduce(initial(), { type: "chat.opened", bot: "one", now: 0, res: {
  session_id: "owned", messages: [], running: false, model: "same", provider: "same", reasoning: "",
} });

describe("account connection loading", () => {
  it("shows initial loading but leaves a ready empty chat usable", () => {
    expect(accountIsLoading(initial())).toBe(true);
    expect(accountIsLoading(ready())).toBe(false);
  });
  it("shows startup and retry progress without hiding a permanent connection error", () => {
    const fail = (code: string) => reduce(initial(), { type: "chat.failed", bot: "one", message: "connection state", code });
    expect(accountIsLoading(fail("gateway_starting"))).toBe(true);
    expect(accountIsLoading(fail("timeout"))).toBe(true);
    expect(accountIsLoading(fail("gateway_unavailable"))).toBe(false);
  });
  it("keeps existing conversation content and other pages available", () => {
    const withMessage = reduce(ready(), { type: "local.user", bot: "one", id: "local-1", text: "saved input", now: 1000 });
    expect(accountIsLoading({ ...withMessage, conn: "connecting" })).toBe(false);
    expect(accountIsLoading({ ...initial(), ui: { ...initial().ui, view: "settings" } })).toBe(false);
  });
});
