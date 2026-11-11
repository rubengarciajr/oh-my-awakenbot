// Add-a-bot popover from the sidebar `+`. "Connect a Hermes profile" lists every profile the bridge sees
// with its status; Connect attaches that profile's gateway (one read: models.options) and re-reads
// bots.list. Create Bot asks Hermes to make an independent profile with the chosen source's settings.
import { useEffect, useState } from "react";
import "./addbot.css";
import type { SlotProps } from "../features";
import type { Bot } from "../lib/protocol";
import { getStore, useStore } from "../state/store";
import { Avatar, Popover, Spinner } from "../ui";
import { connectProfile, refreshBots } from "./bots";
import { t } from "../i18n";
import { statusText } from "../settings/Settings.slot";
import { CreateBot } from "./CreateBot";

export const slot = "addBot";


export default function AddBot({ onClose }: SlotProps["addBot"]) {
  const s = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void refreshBots(getStore()).catch(() => undefined);
  }, []);

  const connect = async (b: Bot) => {
    setBusy(b.name);
    setFailed((f) => ({ ...f, [b.name]: "" }));
    try {
      const after = await connectProfile(getStore(), b.name);
      if (after?.status === "offline") setFailed((f) => ({ ...f, [b.name]: t("ab.couldNotStart") }));
    } catch (e) {
      const msg = typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
      setFailed((f) => ({ ...f, [b.name]: msg }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Popover open onClose={onClose} align="left" width={creating ? "min(360px, calc(100vw - 32px))" : 272} label={t(creating ? "ab.createTitle" : "ab.label")} className="ab-pop">
      {creating ? <CreateBot onBack={() => setCreating(false)} onClose={onClose} /> :
      <div data-testid="addbot">
        <div className="ab-h">{t("ab.title")}</div>
        <p className="ab-sub">{t("ab.sub")}</p>
        <div className="ab-list" data-testid="addbot-list">
          {s.bots.length === 0 && <div className="ab-empty">{t("ab.none")}</div>}
          {s.bots.map((b) => {
            const err = failed[b.name];
            return (
              <div key={b.name} className="ab-row" data-testid={`addbot-${b.name}`}>
                <Avatar bot={b.name} size={22} />
                <span className="ab-m">
                  <span className="ab-n">{b.display_name}</span>
                  <span className="ab-s" title={err || undefined}>
                    <i className={`ab-dot ${b.status}`} aria-hidden="true" />
                    {err ? t("ab.failed") : statusText(b.status)}
                    <span className="ab-p"> · {b.name}</span>
                  </span>
                </span>
                {b.status !== "online" &&
                  (busy === b.name ? (
                    <Spinner size={12} label={t("ab.connecting")} />
                  ) : (
                    <button
                      type="button"
                      className="ab-btn"
                      onClick={() => void connect(b)}
                      disabled={busy !== null || b.status === "starting"}
                    >
                      {t("ab.connect")}
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
        <div className="ab-sep" />
        <button type="button" className="ab-new" disabled={busy !== null} onClick={() => setCreating(true)} data-testid="addbot-create">
          {t("ab.create")}
        </button>
      </div>}
    </Popover>
  );
}
