import { useState, type FormEvent } from "react";
import { t } from "../i18n";
import { getStore, useStore } from "../state/store";
import { Spinner } from "../ui";
import { createBot } from "./bots";

const validId = /^[a-z][a-z0-9_-]{0,63}$/;
const idForName = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z]+/, "").replace(/-+$/, "").slice(0, 64);

export function CreateBot({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [editedId, setEditedId] = useState(false);
  const [source, setSource] = useState(s.selectedBot || s.bots[0]?.name || "");
  const [description, setDescription] = useState("");
  const [soul, setSoul] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const duplicate = s.bots.some((b) => b.name === id);
  const selected = s.bots.find((b) => b.name === source);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || warning) return;
    if (!validId.test(id)) { setError(t("ab.invalidId")); return; }
    if (duplicate) { setError(t("ab.duplicate")); return; }
    setBusy(true);
    setError("");
    try {
      const result = await createBot(getStore(), { name: id, display_name: name.trim(), source,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(soul.trim() ? { soul: soul.trim() } : {}) });
      if (result.warning) setWarning(result.warning);
      else onClose();
    } catch (e) {
      const code = typeof e === "object" && e && "code" in e ? String(e.code) : "";
      const message = typeof e === "object" && e && "message" in e ? String(e.message) : "";
      setError(code === "already_exists" ? t("ab.duplicate") : code === "invalid_name" ? message : message || t("ab.createFailed"));
    } finally { setBusy(false); }
  };
  return (
    <form className="ab-form" onSubmit={(event) => void submit(event)} data-testid="createbot-form" aria-busy={busy}>
      <div className="ab-h">{t("ab.createTitle")}</div>
      <p className="ab-sub">{t("ab.createIntro")}</p>
      <fieldset disabled={busy || !!warning}>
        <label>{t("ab.name")}<input autoFocus required maxLength={64} value={name} onChange={(e) => {
          setName(e.target.value);
          if (!editedId) setId(idForName(e.target.value));
        }} /></label>
        <label>{t("ab.id")}<input required maxLength={64} value={id} aria-describedby="createbot-id-hint"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => { setId(e.target.value); setEditedId(true); setError(""); }} /></label>
        <p className="ab-hint" id="createbot-id-hint">{duplicate ? t("ab.duplicate") : t("ab.idHint")}</p>
        <label>{t("ab.source")}<select value={source} aria-label={t("ab.source")} required onChange={(e) => setSource(e.target.value)}>
          {s.bots.map((b) => <option key={b.name} value={b.name}>{b.display_name}</option>)}
        </select></label>
        {selected && <>
          <p className="ab-hint">{t("ab.modelInherited", { model: selected.model || selected.provider })}</p>
          <p className="ab-hint">{t("ab.inherit", { bot: selected.display_name })}</p>
        </>}
        <label>{t("ab.description")}<input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label>{t("ab.persona")}<textarea rows={3} maxLength={16000} value={soul} onChange={(e) => setSoul(e.target.value)} /></label>
        <p className="ab-hint">{t("ab.personaHint")}</p>
      </fieldset>
      {error && <p className="ab-error" role="alert">{error}</p>}
      {warning && <p className="ab-hint" role="status">{warning}</p>}
      <div className="ab-actions">
        <button type="button" className="ab-btn" disabled={busy} onClick={warning ? onClose : onBack}>{t(warning ? "page.close" : "ab.back")}</button>
        {!warning && <button type="submit" className="ab-btn ab-submit" disabled={busy || !name.trim() || !source || !validId.test(id) || duplicate}>
          {busy && <Spinner size={12} label={t("ab.creating")} />}{t(busy ? "ab.creating" : "ab.createTitle")}
        </button>}
      </div>
    </form>
  );
}
