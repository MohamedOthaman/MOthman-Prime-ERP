import { describe, it, expect } from "vitest";
import { evaluateCondition } from "./engine";
import type { TriggerEvent } from "./types";

// The condition syntax "payload.x" maps to event.payload.x in the evaluator.
function makeEvent(payload: Record<string, unknown>): TriggerEvent<"stock.low"> {
  return {
    id: "test-id",
    type: "stock.low",
    payload: payload as never,
    timestamp: "2024-01-01T00:00:00.000Z",
  };
}

describe("evaluateCondition", () => {
  it("returns true when condition is empty", () => {
    expect(evaluateCondition("", makeEvent({}))).toBe(true);
  });

  it("evaluates numeric >", () => {
    const ev = makeEvent({ currentQty: 3 });
    expect(evaluateCondition("payload.currentQty > 2", ev)).toBe(true);
    expect(evaluateCondition("payload.currentQty > 5", ev)).toBe(false);
  });

  it("evaluates numeric <", () => {
    const ev = makeEvent({ currentQty: 3 });
    expect(evaluateCondition("payload.currentQty < 5", ev)).toBe(true);
    expect(evaluateCondition("payload.currentQty < 2", ev)).toBe(false);
  });

  it("evaluates >= and <=", () => {
    const ev = makeEvent({ currentQty: 5 });
    expect(evaluateCondition("payload.currentQty >= 5", ev)).toBe(true);
    expect(evaluateCondition("payload.currentQty <= 5", ev)).toBe(true);
    expect(evaluateCondition("payload.currentQty >= 6", ev)).toBe(false);
  });

  it("evaluates === / !==", () => {
    const ev = makeEvent({ currency: "KWD" });
    expect(evaluateCondition('payload.currency === "KWD"', ev)).toBe(true);
    expect(evaluateCondition('payload.currency !== "USD"', ev)).toBe(true);
    expect(evaluateCondition('payload.currency === "USD"', ev)).toBe(false);
  });

  it("evaluates array length", () => {
    const ev = makeEvent({ warnings: ["w1", "w2"] });
    expect(evaluateCondition("payload.warnings.length > 0", ev)).toBe(true);
    expect(evaluateCondition("payload.warnings.length > 5", ev)).toBe(false);
  });

  it("returns true on unparseable condition (safe fallback)", () => {
    expect(evaluateCondition("this is not valid", makeEvent({}))).toBe(true);
  });

  it("returns false when referenced path does not exist (undefined > 0 is false)", () => {
    const ev = makeEvent({});
    // undefined > 0 is false in JS — the rule is correctly NOT triggered when
    // the payload doesn't have the expected field.
    expect(evaluateCondition("payload.missing > 0", ev)).toBe(false);
  });
});
