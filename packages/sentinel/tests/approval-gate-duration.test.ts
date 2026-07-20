import { describe, expect, it } from "vitest";
import { parseApprovalDuration } from "../src/approval/ApprovalGate.js";

describe("ApprovalGate duration units", () => {
  it("accepts strict millisecond, second, minute, and hour timeout units", () => {
    expect(parseApprovalDuration("1ms")).toBe(1);
    expect(parseApprovalDuration("1s")).toBe(1_000);
    expect(parseApprovalDuration("1m")).toBe(60_000);
    expect(parseApprovalDuration("1h")).toBe(3_600_000);
    expect(() => parseApprovalDuration("nonsense")).toThrow(/invalid approval timeout/i);
  });
});
