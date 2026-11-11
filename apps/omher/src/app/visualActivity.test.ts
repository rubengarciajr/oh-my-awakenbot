import { describe, expect, it } from "vitest";
import { createVisualActivity, type NativeVisualWindow } from "./visualActivity";

class VisualDocument extends EventTarget {
  visibilityState = "visible";
  documentElement = { dataset: {} as DOMStringMap };
  show(visible: boolean) {
    this.visibilityState = visible ? "visible" : "hidden";
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

function nativeWindow() {
  let visibility: ((event: { payload: boolean }) => void) | undefined;
  let focus: (() => void) | undefined;
  let resize: (() => void) | undefined;
  const state = { visible: true, minimized: false, listeners: 0 };
  const registered = () => { state.listeners++; return () => { state.listeners--; }; };
  const native: NativeVisualWindow = {
    isVisible: async () => state.visible,
    isMinimized: async () => state.minimized,
    listen: async (_, cb) => { visibility = cb; return registered(); },
    onFocusChanged: async (cb) => { focus = cb; return registered(); },
    onResized: async (cb) => { resize = cb; return registered(); },
  };
  return { native, state, emit: (visible: boolean) => visibility?.({ payload: visible }), focus: () => focus?.(), resize: () => resize?.() };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("visual activity", () => {
  it("pauses only hidden documents, restores immediately, and removes its listener", () => {
    const doc = new VisualDocument();
    const source = createVisualActivity(doc);
    const seen: boolean[] = [];
    const stop = source.subscribe(() => seen.push(source.getSnapshot()));
    const dispose = source.start();
    expect(source.getSnapshot()).toBe(true);
    doc.show(false);
    expect(source.getSnapshot()).toBe(false);
    expect(doc.documentElement.dataset.visualActive).toBe("false");
    doc.show(false);
    doc.show(true);
    expect(seen).toEqual([false, true]);
    expect(doc.documentElement.dataset.visualActive).toBe("true");
    stop();
    dispose();
    doc.show(false);
    expect(source.getSnapshot()).toBe(true);
    expect(seen).toEqual([false, true]);
  });

  it("uses native hide and restore even when WebView document visibility stays visible", async () => {
    const doc = new VisualDocument();
    const host = nativeWindow();
    const source = createVisualActivity(doc, host.native);
    const dispose = source.start();
    await settle();
    host.emit(false);
    expect(source.getSnapshot()).toBe(false);
    host.emit(true);
    expect(source.getSnapshot()).toBe(true);
    doc.show(false);
    host.emit(true);
    expect(source.getSnapshot()).toBe(false);
    dispose();
    expect(host.state.listeners).toBe(0);
  });

  it("reads an initially minimized window and does not equate focus loss with hiding", async () => {
    const doc = new VisualDocument();
    const host = nativeWindow();
    host.state.minimized = true;
    const source = createVisualActivity(doc, host.native);
    const dispose = source.start();
    await settle();
    expect(source.getSnapshot()).toBe(false);
    host.state.minimized = false;
    host.resize();
    await settle();
    expect(source.getSnapshot()).toBe(true);
    host.focus(); // A different app may be focused while this window is still visible.
    await settle();
    expect(source.getSnapshot()).toBe(true);
    host.state.visible = false;
    host.focus();
    await settle();
    expect(source.getSnapshot()).toBe(false);
    dispose();
  });

  it("does not let a delayed native snapshot overwrite a newer hide event", async () => {
    const host = nativeWindow();
    let answer: ((visible: boolean) => void) | undefined;
    host.native.isVisible = () => new Promise((resolve) => { answer = resolve; });
    const source = createVisualActivity(new VisualDocument(), host.native);
    const dispose = source.start();
    host.emit(false);
    answer?.(true);
    await settle();
    expect(source.getSnapshot()).toBe(false);
    dispose();
  });

  it("cleans native listeners that finish registering after unmount", async () => {
    const host = nativeWindow();
    const source = createVisualActivity(new VisualDocument(), host.native);
    const dispose = source.start();
    dispose();
    await settle();
    expect(host.state.listeners).toBe(0);
  });

  it("keeps browser visibility when a native snapshot fails", async () => {
    const doc = new VisualDocument();
    const host = nativeWindow();
    host.native.isVisible = async () => { throw new Error("window unavailable"); };
    const source = createVisualActivity(doc, host.native);
    const dispose = source.start();
    await settle();
    expect(source.getSnapshot()).toBe(true);
    doc.show(false);
    expect(source.getSnapshot()).toBe(false);
    dispose();
  });
});
