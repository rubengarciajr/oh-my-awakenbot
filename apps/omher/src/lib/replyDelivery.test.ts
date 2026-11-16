import { describe, expect, it } from "vitest";
import { ReplyDelivery } from "./replyDelivery";

describe("reply delivery measurements", () => {
  it("measures from WebSocket send through the first received reply, including a late acknowledgement", () => {
    let now = 10;
    const delivery = new ReplyDelivery(() => now);
    const send = delivery.begin();
    now = 60;
    delivery.observe({ event: "delta", admission_id: "admission", text: "not retained" });
    now = 90;
    delivery.accept(send, { trace_id: "trace", admission_id: "admission" });
    expect(delivery.forTrace("trace")).toEqual({ client_first_text_ms: 50, client_submit_ack_ms: 80 });
    expect(JSON.stringify(delivery.forTrace("trace"))).not.toContain("retained");
  });

  it("does not assign another admission or an empty segment to this send", () => {
    let now = 100;
    const delivery = new ReplyDelivery(() => now);
    const send = delivery.begin();
    delivery.observe({ event: "delta", admission_id: "other", text: "other turn" });
    delivery.accept(send, { trace_id: "trace", admission_id: "owned" });
    now = 200;
    delivery.observe({ event: "delta", admission_id: "owned", text: null });
    expect(delivery.forTrace("trace")?.client_first_text_ms).toBeNull();
    now = 250;
    delivery.observe({ event: "message", admission_id: "owned", text: "final" });
    expect(delivery.forTrace("trace")?.client_first_text_ms).toBe(150);
  });

  it("keeps unknown correlation and evicted early observations unknown", () => {
    const delivery = new ReplyDelivery(() => 10);
    const send = delivery.begin();
    for (let i = 0; i < 200; i++) delivery.observe({ event: "delta", admission_id: `a${i}`, text: "x" });
    delivery.accept(send, { trace_id: "trace", admission_id: "a0" });
    delivery.observe({ event: "message", admission_id: "a0", text: "late" });
    expect(delivery.forTrace("trace")?.client_first_text_ms).toBeNull();
    delivery.accept(send, { trace_id: "old-engine" });
    expect(delivery.forTrace("old-engine")?.client_first_text_ms).toBeNull();
  });
});
