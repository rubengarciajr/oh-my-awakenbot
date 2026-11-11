import { useCallback, useEffect, useState } from "react";
import type { PerformanceSnapshot, ReplyTiming } from "../lib/protocol";
import { useStore } from "../state/store";
import { t, type Key } from "../i18n";

const FIELDS: { field: keyof ReplyTiming; label: Key }[] = [
  { field: "client_first_text_ms", label: "perf.received" },
  { field: "client_submit_ack_ms", label: "perf.clientAck" },
  { field: "bridge_prepare_ms", label: "perf.prepare" },
  { field: "submit_ack_ms", label: "perf.ack" },
  { field: "turn_start_ms", label: "perf.start" },
  { field: "first_progress_ms", label: "perf.progress" },
  { field: "first_text_ms", label: "perf.text" },
  { field: "provider_ms", label: "perf.provider" },
  { field: "provider_first_chunk_ms", label: "perf.chunk" },
  { field: "tools_ms", label: "perf.tools" },
  { field: "total_ms", label: "perf.total" },
];

export function ReplyPerformance() {
  const read = useStore().performance;
  const [data, setData] = useState<PerformanceSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError(false);
    try { setData(await read()); }
    catch { setError(true); }
    finally { setBusy(false); }
  }, [read]);
  useEffect(() => { void refresh(); }, [refresh]);
  return (
    <section className="reply-performance" aria-label={t("perf.title")} data-testid="reply-performance">
      <div className="st-gh">{t("perf.title")}</div>
      <p className="st-note">{t("perf.hint")}</p>
      <button type="button" disabled={busy} onClick={() => void refresh()}>{t("perf.refresh")}</button>
      {error && <p role="status">{t("perf.unavailable")}</p>}
      {data?.recent.length === 0 && <p>{t("perf.empty")}</p>}
      {data?.recent.map((row, index) => (
        <details key={row.trace_id} className="st-grp reply-performance-sample" open={index === 0}>
          <summary>{t("perf.sample", { n: data.recent.length - index })}</summary>
          <dl>
            {FIELDS.map(({ field, label }) => {
              const value = row[field];
              return (
                <div key={field} className="reply-performance-value">
                  <dt>{t(label)}</dt>
                  <dd>{typeof value === "number" && Number.isFinite(value) ? t("perf.seconds", { n: (value / 1000).toFixed(2) }) : t("perf.unknown")}</dd>
                </div>
              );
            })}
          </dl>
        </details>
      ))}
      {!!data?.recent.length && <p className="st-note">{t("perf.scope")}</p>}
    </section>
  );
}
