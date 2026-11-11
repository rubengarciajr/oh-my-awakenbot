import { useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Stop = () => void;
interface VisualDocument {
  visibilityState: string;
  documentElement: { dataset: DOMStringMap };
  addEventListener(event: string, handler: () => void): void;
  removeEventListener(event: string, handler: () => void): void;
}

export interface NativeVisualWindow {
  isVisible(): Promise<boolean>;
  isMinimized(): Promise<boolean>;
  listen(event: string, handler: (event: { payload: boolean }) => void): Promise<Stop>;
  onFocusChanged(handler: () => void): Promise<Stop>;
  onResized(handler: () => void): Promise<Stop>;
}

/** Display work only. The bridge, event subscriptions and session lifecycle never consult this source. */
export function createVisualActivity(doc: VisualDocument, native?: NativeVisualWindow) {
  let nativeVisible = true;
  let active = doc.visibilityState !== "hidden";
  const listeners = new Set<Stop>();
  const update = () => {
    const next = nativeVisible && doc.visibilityState !== "hidden";
    doc.documentElement.dataset.visualActive = String(next);
    if (next === active) return;
    active = next;
    listeners.forEach((fn) => fn());
  };
  return {
    getSnapshot: () => active,
    subscribe: (fn: Stop) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start: () => {
      let alive = true;
      let revision = 0;
      const stops: Stop[] = [];
      const register = (pending: Promise<Stop>) => {
        void pending.then((stop) => { if (alive) stops.push(stop); else stop(); }, () => {});
      };
      const refresh = () => {
        if (!alive || !native) return;
        const askedAt = ++revision;
        void Promise.all([native.isVisible(), native.isMinimized()]).then(([visible, minimized]) => {
          if (!alive || askedAt !== revision || typeof visible !== "boolean" || typeof minimized !== "boolean") return;
          nativeVisible = visible && !minimized;
          update();
        }, () => {}); // A failed shell read leaves document visibility in charge.
      };
      doc.addEventListener("visibilitychange", update);
      update();
      if (native) {
        // WKWebView may keep document.visibilityState visible after Tauri hides its window.
        register(native.listen("awaken-window-visibility", ({ payload }) => {
          if (!alive || typeof payload !== "boolean") return;
          revision++;
          nativeVisible = payload;
          update();
        }));
        // Focus is a reason to read visibility, never a substitute for it: an unfocused window can be visible.
        register(native.onFocusChanged(refresh));
        register(native.onResized(refresh));
        refresh();
      }
      return () => {
        alive = false;
        doc.removeEventListener("visibilitychange", update);
        stops.forEach((stop) => stop());
      };
    },
  };
}

let source: ReturnType<typeof createVisualActivity> | undefined;
const current = () => source ??= createVisualActivity(document,
  "__TAURI_INTERNALS__" in window ? getCurrentWindow() : undefined);

export const startVisualActivity = () => current().start();
export const useVisualActivity = () => useSyncExternalStore(current().subscribe, current().getSnapshot);
