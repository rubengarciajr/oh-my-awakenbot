import { describe, expect, it } from "vitest";
import type { BotReady, ModelChangeResult, ModelOptions } from "../../lib/protocol";
import { POLL_MS, WAIT_MS, createReady, pickModel, type ReadyDeps, type SignIn } from "./ready";

const NO = "Hermes is not connected to any AI provider yet.";
const ok = (provider = "claude-proxy", model = "m"): BotReady => ({ ok: true, provider, model, error: "" });
const no = (error = NO): BotReady => ({ ok: false, provider: "", model: "", error });
const opts = (current: { provider: string; model: string }, extra: { slug: string; models: string[] }[] = []): ModelOptions => ({
  providers: [{ slug: "claude-proxy", name: "Claude", models: ["Opus 5.5"] }, ...extra.map((e) => ({ ...e, name: e.slug }))],
  current: { ...current, reasoning: "" },
  reasoning_levels: [],
});
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A fake bridge: `answer(provider?)` decides each bots.ready; timers run by hand. */
function make(
  answer: (provider?: SignIn) => BotReady,
  models: () => ModelOptions = () => opts({ provider: "", model: "" }),
  chat = "",
  change: (provider: SignIn, model: string, confirm?: string) => ModelChangeResult | undefined = (provider, model) => ({ model, provider, reasoning: "" }),
) {
  const asks: (string | undefined)[] = [];
  const sets: { bot: string; provider: string; model: string; confirm?: string }[] = [];
  const modelReads: boolean[] = [];
  let clock = 0;
  let ticks: (() => void)[] = [];
  let chatProvider = chat;
  const deps: ReadyDeps = {
    ask: async (_bot, provider) => {
      asks.push(provider);
      return answer(provider);
    },
    models: async (_bot, fresh) => {
      modelReads.push(!!fresh);
      return models();
    },
    setModel: async (bot, provider, model, confirm) => {
      sets.push({ bot, provider, model, ...(confirm ? { confirm } : {}) });
      const result = change(provider, model, confirm);
      if (result && !result.confirmation && result.status !== "deferred") chatProvider = result.provider;
      return result;
    },
    chatProvider: () => chatProvider,
    now: () => clock,
    every(fn) {
      ticks.push(fn);
      return () => {
        ticks = ticks.filter((f) => f !== fn);
      };
    },
  };
  const r = createReady(deps);
  return {
    r,
    asks,
    sets,
    modelReads,
    pollers: () => ticks.length,
    async tick(ms = POLL_MS) {
      clock += ms;
      for (const f of [...ticks]) f();
      await flush();
      await flush();
    },
  };
}

describe("pickModel", () => {
  it("takes Hermes' cost-safe pick: the first model that is not an Opus or Fable tier", () => {
    expect(pickModel(["claude-opus-5-5", "claude-sonnet-5"])).toBe("claude-sonnet-5");
    expect(pickModel(["anthropic/claude-fable-5.2", "moonshotai/kimi-k3"])).toBe("moonshotai/kimi-k3");
    expect(pickModel(["gpt-6-sol", "gpt-6-luna"])).toBe("gpt-6-sol");
    expect(pickModel(["claude-opus-5-5"])).toBe("claude-opus-5-5");
    expect(pickModel([])).toBe("");
  });
});

describe("bot readiness", () => {
  it("a ready bot is asked once and shows nothing; a focus does not ask it again", async () => {
    const f = make(() => ok());
    await f.r.ensure("kami");
    await f.r.ensure("kami");
    expect(f.r.get("kami").status).toBe("ready");
    f.r.focused();
    await f.r.ensure("kami");
    expect(f.asks).toEqual([undefined]);
  });

  it("a bot Hermes says cannot answer shows the block with Hermes' sentence; a focus asks it again", async () => {
    const f = make(() => no());
    await f.r.ensure("kami");
    expect(f.r.get("kami")).toMatchObject({ status: "not", error: NO, waiting: null });
    f.r.focused();
    expect(f.r.get("kami").stale).toBe(true);
    await f.r.ensure("kami");
    expect(f.asks).toEqual([undefined, undefined]);
  });

  it("a chat error makes a ready bot be asked again", async () => {
    const f = make(() => ok());
    await f.r.ensure("kami");
    f.r.invalidate("kami");
    await f.r.ensure("kami");
    expect(f.asks.length).toBe(2);
  });

  it("an unknown answer (older Hermes, still checking) counts as ready", async () => {
    const f = make(() => ({ ...no(), unknown: true }));
    await f.r.ensure("kami");
    expect(f.r.get("kami").status).toBe("ready");
  });

  it("each bot is its own: multi-bot users see the block only on the bot that cannot answer", async () => {
    const f = make(() => no());
    await f.r.ensure("friren");
    const g = make(() => ok());
    await g.r.ensure("kami");
    expect(f.r.get("friren").status).toBe("not");
    expect(f.r.get("kami").status).toBe("checking");
    expect(g.r.get("kami").status).toBe("ready");
  });

  it("after a sign-in: polls every 3 s, sets the provider's cost-safe model once its strict check passes, clears", async () => {
    let signed = false;
    const f = make(
      (provider) => (provider ? (signed && provider === "nous" ? ok("nous", "z-ai/glm-5.3") : no()) : no()),
      () => opts({ provider: "", model: "" }, signed ? [{ slug: "nous", models: ["claude-opus-5-5", "claude-sonnet-5"] }] : []),
    );
    await f.r.ensure("kami");
    f.r.waitFor("kami", "nous");
    expect(f.r.get("kami")).toMatchObject({ status: "not", waiting: "nous" });
    await f.tick();
    expect(f.r.get("kami").waiting).toBe("nous");
    expect(f.sets).toEqual([]);
    signed = true;
    await f.tick();
    expect(f.sets).toEqual([{ bot: "kami", provider: "nous", model: "claude-sonnet-5" }]);
    expect(f.r.get("kami")).toMatchObject({ status: "ready", waiting: null });
    expect(f.pollers()).toBe(0);
  });

  it("a sign-in whose own check already passes on that provider still gets a model the provider lists", async () => {
    let signed = false;
    const f = make(
      () => (signed ? ok("openai-codex", "z-ai/glm-5.3") : no()),
      () => opts({ provider: "", model: "z-ai/glm-5.3" }, [{ slug: "openai-codex", models: ["gpt-6-sol"] }]),
    );
    await f.r.ensure("kami");
    f.r.waitFor("kami", "openai-codex");
    signed = true;
    await f.tick();
    expect(f.sets).toEqual([{ bot: "kami", provider: "openai-codex", model: "gpt-6-sol" }]);
    expect(f.r.get("kami").status).toBe("ready");
  });

  it("re-reads a models list that does not name the provider yet", async () => {
    let first = true;
    const g = make(
      (p) => (p === "nous" ? ok("nous") : no()),
      () => {
        const o = first ? opts({ provider: "", model: "" }) : opts({ provider: "", model: "" }, [{ slug: "nous", models: ["moonshotai/kimi-k3"] }]);
        first = false;
        return o;
      },
    );
    await g.r.ensure("kami");
    g.r.waitFor("kami", "nous");
    await g.tick();
    expect(g.modelReads).toEqual([false, true]);
    expect(g.sets).toEqual([{ bot: "kami", provider: "nous", model: "moonshotai/kimi-k3" }]);
  });

  it("a focus asks a waiting sign-in at once", async () => {
    let signed = false;
    const f = make((p) => (signed && p === "nous" ? ok("nous") : no()), () => opts({ provider: "", model: "" }, [{ slug: "nous", models: ["claude-sonnet-5"] }]));
    await f.r.ensure("kami");
    f.r.waitFor("kami", "nous");
    signed = true;
    f.r.focused();
    await flush();
    await flush();
    expect(f.r.get("kami").status).toBe("ready");
  });

  it("holds a guarded sign-in model choice until the person confirms its exact token", async () => {
    const f = make((p) => p === "nous" ? ok("nous") : no(),
      () => opts({ provider: "", model: "" }, [{ slug: "nous", models: ["safe-model"] }]), "",
      (provider, model, confirm) => confirm === "guard-token" ? { model, provider, reasoning: "" }
        : { model: "old-model", provider: "old-provider", reasoning: "", confirmation: { token: "guard-token", message: "Review this model's terms." } });
    f.r.waitFor("kami", "nous");
    await f.tick();
    expect(f.r.get("kami")).toMatchObject({ status: "not", waiting: null,
      selection: { provider: "nous", model: "safe-model", confirmation: { token: "guard-token", message: "Review this model's terms." } } });
    expect(f.pollers()).toBe(0);
    f.r.focused();
    await f.r.ensure("kami");
    await f.tick();
    expect(f.sets).toHaveLength(1);
    await f.r.confirmModel("kami");
    expect(f.sets[1]).toEqual({ bot: "kami", provider: "nous", model: "safe-model", confirm: "guard-token" });
    expect(f.r.get("kami")).toMatchObject({ status: "ready", selection: null, modelBusy: false });
  });

  it("cancels a sign-in model guard without submitting its token", async () => {
    const f = make((p) => p === "nous" ? ok("nous") : no(),
      () => opts({ provider: "nous", model: "removed-model" }, [{ slug: "nous", models: ["safe-model"] }]), "nous",
      () => ({ model: "removed-model", provider: "nous", reasoning: "", confirmation: { token: "guard-token", message: "Confirm" } }));
    f.r.waitFor("kami", "nous");
    await f.tick();
    f.r.cancelModel("kami");
    await f.r.confirmModel("kami");
    expect(f.sets).toHaveLength(1);
    expect(f.sets[0]).not.toHaveProperty("confirm");
    expect(f.r.get("kami")).toMatchObject({ status: "not", waiting: null });
    expect(f.r.get("kami").modelError).toContain("Choose a model");
    f.r.focused();
    await f.r.ensure("kami");
    f.r.invalidate("kami");
    await f.r.ensure("kami");
    await f.tick();
    expect(f.sets).toHaveLength(1);
    expect(f.r.get("kami")).toMatchObject({ selection: { cancelled: true } });
    expect(f.r.get("kami").selection?.confirmation).toBeUndefined();
    // Only another explicit sign-in choice may try this declined model again.
    f.r.waitFor("kami", "nous");
    await f.tick();
    expect(f.sets).toHaveLength(2);
    expect(f.r.get("kami").selection?.confirmation?.token).toBe("guard-token");
  });

  it.each([
    { provider: "old-provider", model: "safe-model" },
    { provider: "nous", model: "old-model" },
  ])("keeps a canonical model mismatch pending without resending: $provider/$model", async (canonical) => {
    const f = make((p) => p === "nous" ? ok("nous") : no(),
      () => opts({ provider: "old-provider", model: "old-model" }, [{ slug: "nous", models: ["safe-model"] }]), "",
      () => ({ ...canonical, reasoning: "" }));
    f.r.waitFor("kami", "nous");
    await f.tick();
    expect(f.r.get("kami")).toMatchObject({ status: "not", selection: { failed: true }, waiting: null });
    expect(f.r.get("kami").modelError).toContain("Could not select a model");
    f.r.focused();
    await f.r.ensure("kami");
    await f.tick();
    expect(f.sets).toHaveLength(1);
    expect(f.r.get("kami").status).toBe("not");
  });

  it("does not claim a confirmed model applied when Hermes returns the old route", async () => {
    const f = make((p) => p === "nous" ? ok("nous") : no(),
      () => opts({ provider: "old-provider", model: "old-model" }, [{ slug: "nous", models: ["safe-model"] }]), "",
      (_provider, _model, confirm) => ({ model: "old-model", provider: "old-provider", reasoning: "",
        ...(!confirm ? { confirmation: { token: "guard-token", message: "Confirm" } } : {}) }));
    f.r.waitFor("kami", "nous");
    await f.tick();
    await f.r.confirmModel("kami");
    expect(f.r.get("kami")).toMatchObject({ status: "not", selection: { failed: true }, modelBusy: false });
    f.r.focused();
    await f.r.ensure("kami");
    await f.tick();
    expect(f.sets).toHaveLength(2);
    expect(f.sets[1].confirm).toBe("guard-token");
  });

  it("keeps a deferred choice pending without resending, then accepts the observed model", async () => {
    let current = { provider: "old", model: "old" };
    const f = make((p) => p === "nous" ? ok("nous") : no(),
      () => opts(current, [{ slug: "nous", models: ["safe-model"] }]), "",
      () => ({ ...current, reasoning: "", status: "deferred" }));
    f.r.waitFor("kami", "nous");
    await f.tick();
    expect(f.r.get("kami")).toMatchObject({ status: "not", selection: { deferred: true } });
    await f.tick();
    expect(f.sets).toHaveLength(1);
    current = { provider: "nous", model: "safe-model" };
    await f.tick();
    expect(f.r.get("kami")).toMatchObject({ status: "ready", selection: null, waiting: null });
    expect(f.sets).toHaveLength(1);
  });

  it("shows an unconfirmed failure and does not retry a model write on a timer", async () => {
    const f = make((p) => p === "nous" ? ok("nous") : no(),
      () => opts({ provider: "", model: "" }, [{ slug: "nous", models: ["safe-model"] }]), "", () => undefined);
    f.r.waitFor("kami", "nous");
    await f.tick();
    expect(f.r.get("kami")).toMatchObject({ status: "not", selection: { failed: true }, waiting: null });
    expect(f.r.get("kami").modelError).toContain("Could not select a model");
    await f.tick();
    expect(f.sets).toHaveLength(1);
    expect(f.pollers()).toBe(0);
  });

  it("does not claim readiness when the signed-in provider lists no model", async () => {
    const f = make((p) => p === "nous" ? ok("nous") : no(), () => opts({ provider: "", model: "" }, [{ slug: "nous", models: [] }]));
    f.r.waitFor("kami", "nous");
    await f.tick();
    expect(f.r.get("kami").status).toBe("not");
    expect(f.sets).toEqual([]);
    expect(f.r.get("kami").modelError).toContain("Choose a model");
  });

  it("stops waiting after 10 minutes; the block stays and offers the sign-ins again", async () => {
    const f = make(() => no());
    await f.r.ensure("kami");
    f.r.waitFor("kami", "nous");
    await f.tick(WAIT_MS + 1);
    expect(f.r.get("kami")).toMatchObject({ status: "not", waiting: null });
    expect(f.pollers()).toBe(0);
  });

  it("a bot whose chat already runs on a signed-in provider is ready when that provider's strict check passes", async () => {
    // e.g. the app opened again after a sign-in: the bot's own check says no (nous is not Hermes' active
    // provider), but its chat runs on nous with a model nous lists
    const on = () => opts({ provider: "nous", model: "claude-sonnet-5" }, [{ slug: "nous", models: ["claude-sonnet-5"] }]);
    const f = make((p) => (p === "nous" ? ok("nous") : no()), on, "nous");
    await f.r.ensure("kami");
    expect(f.r.get("kami").status).toBe("ready");
    expect(f.asks).toEqual([undefined, "nous"]);
    expect(f.sets).toEqual([]); // already on a model the provider lists: nothing is changed
    // a chat on a provider that is not one of the sign-ins is not second-guessed
    const g = make(() => no(), () => opts({ provider: "claude-proxy", model: "Opus 5.5" }), "claude-proxy");
    await g.r.ensure("kami");
    expect(g.r.get("kami").status).toBe("not");
    expect(g.asks).toEqual([undefined]);
  });
});
