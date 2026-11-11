import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t } from "../i18n";
import { useStore } from "../state/store";
import "./window-chrome.css";

type ChromeWindow = Pick<ReturnType<typeof getCurrentWindow>, "close" | "minimize" | "toggleMaximize" | "isMaximized" | "onResized">;
declare global {
  interface Window { __AWAKEN_DESKTOP__?: ChromeWindow; }
}
const nativeWindow = (): ChromeWindow | null => window.__AWAKEN_DESKTOP__ ??
  ("__TAURI_INTERNALS__" in window ? getCurrentWindow() : null);

/** Lives outside launch/setup so the person can always move, minimize or close the app. */
export function WindowChrome({ children }: { children: ReactNode }) {
  // Keep the chrome's accessible labels in step with the person's explicit language choice.
  useStore();
  const [maximized, setMaximized] = useState(false);
  const mac = /Macintosh|Mac OS X/.test(navigator.userAgent);
  const desktop = "__TAURI_INTERNALS__" in window || !!window.__AWAKEN_DESKTOP__;

  useEffect(() => {
    const current = nativeWindow();
    if (!current) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    const update = () => {
      void current.isMaximized().then((value) => {
        if (alive) setMaximized(value);
      }, () => {});
    };
    update();
    void current.onResized(update).then((stop) => {
      if (alive) unlisten = stop;
      else stop();
    }, () => {});
    return () => { alive = false; unlisten?.(); };
  }, []);

  const act = async (action: "close" | "minimize" | "toggleMaximize") => {
    const current = nativeWindow();
    // The browser preview has no desktop window to operate on.
    if (!current) return;
    try {
      await current[action]();
      if (action === "toggleMaximize") setMaximized(await current.isMaximized());
    } catch (error) {
      console.warn("Window control failed", error);
    }
  };

  const close = (
    <button type="button" className="window-control window-control--close"
      aria-label={t("window.close")} title={t("window.close")} onClick={() => void act("close")}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="m2 2 8 8M10 2l-8 8" /></svg>
    </button>
  );
  const minimize = (
    <button type="button" className="window-control window-control--minimize"
      aria-label={t("window.minimize")} title={t("window.minimize")} onClick={() => void act("minimize")}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M1 6h10" /></svg>
    </button>
  );
  const maximize = (
    <button type="button" className="window-control window-control--maximize"
      aria-label={t(maximized ? "window.restore" : "window.maximize")}
      title={t(maximized ? "window.restore" : "window.maximize")} onClick={() => void act("toggleMaximize")}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
        {maximized ? <path d="M4 3V1h7v7H9M1 4h7v7H1z" /> : <path d="M1.5 1.5h9v9h-9z" />}
      </svg>
    </button>
  );

  return (
    <div className="desktop-shell" data-platform={mac ? "mac" : "desktop"} data-native={desktop || undefined}>
      {desktop && <header className="window-chrome" data-testid="window-chrome">
        <div className="window-drag-region" data-tauri-drag-region>
          <span className="window-chrome-name" data-tauri-drag-region>AWAKEN BOT</span>
        </div>
        <div className="window-controls" role="group" aria-label={t("window.controls")}>
          {mac ? <>{close}{minimize}{maximize}</> : <>{minimize}{maximize}{close}</>}
        </div>
      </header>}
      <div className="desktop-content">{children}</div>
    </div>
  );
}
