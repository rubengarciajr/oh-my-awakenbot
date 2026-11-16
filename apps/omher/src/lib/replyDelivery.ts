/** Renderer delivery timing. Only opaque identities and monotonic times are retained. */
type Send = { at: number; evictions: number };
type Delivery = { admission: string | null; sent: Send; ack: number; first: number | null; gap: boolean };
const identity = (v: unknown): string | null => typeof v === "string" && v.length > 0 && v.length <= 256 ? v : null;

export class ReplyDelivery {
  private recent = new Map<string, Delivery>();
  private early = new Map<string, number>();
  private evictions = 0;
  constructor(private now: () => number = () => performance.now()) {}

  begin(): Send { return { at: this.now(), evictions: this.evictions }; }

  accept(sent: Send, receipt: unknown): void {
    if (!receipt || typeof receipt !== "object") return;
    const r = receipt as Record<string, unknown>;
    const trace = identity(r.trace_id);
    if (!trace) return;
    const admission = identity(r.admission_id);
    const first = admission ? this.early.get(admission) : undefined;
    const gap = sent.evictions !== this.evictions;
    this.recent.set(trace, { admission, sent, ack: this.now(), gap,
      first: !gap && first !== undefined && first >= sent.at ? first : null });
    while (this.recent.size > 30) this.recent.delete(this.recent.keys().next().value!);
  }

  observe(frame: Record<string, unknown>): void {
    if (!["delta", "message"].includes(String(frame.event)) || typeof frame.text !== "string" || !frame.text) return;
    const admission = identity(frame.admission_id);
    if (!admission) return;
    const at = this.now();
    if (!this.early.has(admission)) {
      this.early.set(admission, at);
      while (this.early.size > 128) { this.early.delete(this.early.keys().next().value!); this.evictions++; }
    }
    for (const row of this.recent.values()) {
      if (row.admission === admission && row.first === null && !row.gap && at >= row.sent.at) row.first = at;
    }
  }

  forTrace(trace: string): { client_first_text_ms: number | null; client_submit_ack_ms: number } | undefined {
    const row = this.recent.get(trace);
    if (!row) return;
    return { client_first_text_ms: row.first === null ? null : Math.max(0, Math.round(row.first - row.sent.at)),
      client_submit_ack_ms: Math.max(0, Math.round(row.ack - row.sent.at)) };
  }
}
