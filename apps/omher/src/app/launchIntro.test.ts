import { describe, expect, it, vi } from "vitest";
import { introForLaunch, INTRO_DAY_KEY, recordIntroShown } from "./launchIntro";

function memory(value: string | null = null) {
  return { getItem: vi.fn(() => value), setItem: vi.fn((_key: string, next: string) => { value = next; }) };
}

const local = (day: number, hour = 12) => new Date(2026, 10, day, hour);

describe("once-per-local-day native intro", () => {
  it("shows on the first native launch and records only its local day when shown", () => {
    const storage = memory();
    const launch = introForLaunch({ native: true, force: false, now: local(11), storage: () => storage });
    expect(launch).toEqual({ show: true, day: "2026-11-11", remember: true });
    expect(storage.setItem).not.toHaveBeenCalled(); // render/lazy initializers must remain pure
    recordIntroShown(launch, () => storage);
    expect(storage.setItem).toHaveBeenCalledWith(INTRO_DAY_KEY, "2026-11-11");
    expect(introForLaunch({ native: true, force: false, now: local(11, 23), storage: () => storage }).show).toBe(false);
  });

  it("shows again when the local calendar day changes, including month/year rollover", () => {
    const storage = memory("2026-11-11");
    expect(introForLaunch({ native: true, force: false, now: local(12, 0), storage: () => storage }).show).toBe(true);
    const yearEnd = memory("2026-12-31");
    expect(introForLaunch({ native: true, force: false, now: new Date(2027, 0, 1, 0, 0), storage: () => yearEnd }).day).toBe("2027-01-01");
  });

  it("uses local calendar fields instead of a UTC timestamp or a rolling 24-hour interval", () => {
    // UTC would say Nov 12, but this clock's local fields say Nov 11.
    const now = local(11, 23);
    vi.spyOn(now, "toISOString").mockReturnValue("2026-11-12T07:00:00.000Z");
    expect(introForLaunch({ native: true, force: false, now, storage: () => memory("2026-11-11") }).show).toBe(false);
    expect(now.toISOString).not.toHaveBeenCalled();
  });

  it("repeated StrictMode render decisions do not consume the first day's intro", () => {
    const storage = memory();
    const props = { native: true, force: false, now: local(11), storage: () => storage };
    const first = introForLaunch(props);
    const second = introForLaunch(props);
    expect(first.show && second.show).toBe(true);
    recordIntroShown(second, () => storage);
    recordIntroShown(second, () => storage); // a replayed effect is idempotent
    expect(introForLaunch(props).show).toBe(false);
  });

  it("ordinary browser previews skip the intro and never access storage", () => {
    const storage = vi.fn(() => { throw new Error("blocked"); });
    const launch = introForLaunch({ native: false, force: false, now: local(11), storage });
    recordIntroShown(launch, storage);
    expect(launch.show).toBe(false);
    expect(storage).not.toHaveBeenCalled();
  });

  it("the explicit preview override always shows without consuming the daily marker", () => {
    const storage = memory("2026-11-11");
    const launch = introForLaunch({ native: true, force: true, now: local(11), storage: () => storage });
    expect(launch).toMatchObject({ show: true, remember: false });
    recordIntroShown(launch, () => storage);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("blocked storage access, reads and writes never crash the app", () => {
    const inaccessible = () => { throw new Error("SecurityError"); };
    const launch = introForLaunch({ native: true, force: false, now: local(11), storage: inaccessible });
    expect(launch.show).toBe(true);
    expect(() => recordIntroShown(launch, inaccessible)).not.toThrow();
    const broken = { getItem: () => { throw new Error("read failed"); }, setItem: () => { throw new Error("quota"); } };
    expect(introForLaunch({ native: true, force: false, now: local(11), storage: () => broken }).show).toBe(true);
    expect(() => recordIntroShown(launch, () => broken)).not.toThrow();
  });

  it("malformed, old or future markers cannot suppress today's intro", () => {
    for (const marker of ["", "not-a-date", "2026-11-10", "2026-11-12"]) {
      expect(introForLaunch({ native: true, force: false, now: local(11), storage: () => memory(marker) }).show).toBe(true);
    }
  });
});
