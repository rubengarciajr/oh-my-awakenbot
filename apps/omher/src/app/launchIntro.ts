/** One local day, never a prompt or a session record. */
export const INTRO_DAY_KEY = "awaken.launch-intro-day";
type IntroStorage = Pick<Storage, "getItem" | "setItem">;
type StorageAccess = () => IntroStorage;
export interface IntroLaunch {
  show: boolean;
  day: string;
  remember: boolean;
}

const browserStorage: StorageAccess = () => window.localStorage;

/** Read-only during render, so React StrictMode cannot consume the first day's intro. */
export function introForLaunch({ native, force, now = new Date(), storage = browserStorage }: {
  native: boolean;
  force: boolean;
  now?: Date;
  storage?: StorageAccess;
}): IntroLaunch {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (force) return { show: true, day, remember: false };
  if (!native) return { show: false, day, remember: false };
  try {
    if (storage().getItem(INTRO_DAY_KEY) === day) return { show: false, day, remember: false };
  } catch { /* Storage may be disabled: the intro remains usable without persistence. */ }
  return { show: true, day, remember: true };
}

/** Mark the committed showing immediately, so a crash/reopen that day takes the fast path. */
export function recordIntroShown(launch: IntroLaunch, storage: StorageAccess = browserStorage): void {
  if (!launch.show || !launch.remember) return;
  try {
    storage().setItem(INTRO_DAY_KEY, launch.day);
  } catch { /* A blocked or full local store must never prevent startup. */ }
}
