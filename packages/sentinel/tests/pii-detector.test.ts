import { describe, expect, it } from "vitest";
import { detectPII, redactPII } from "../src/pii/PIIDetector.js";

describe("PIIDetector", () => {
  it("detects supported PII patterns in source order", () => {
    const text =
      "ip 192.168.1.20 email alice@example.com card 4111 1111 1111 1111; ssn 123-45-6789 phone +90 532 123 45 67 tc 12345678901";

    expect(detectPII(text)).toEqual([
      expect.objectContaining({ type: "ipv4", value: "192.168.1.20" }),
      expect.objectContaining({ type: "email", value: "alice@example.com" }),
      expect.objectContaining({ type: "creditCard", value: "4111 1111 1111 1111" }),
      expect.objectContaining({ type: "ssn", value: "123-45-6789" }),
      expect.objectContaining({ type: "phone", value: "+90 532 123 45 67" }),
      expect.objectContaining({ type: "tcKimlik", value: "12345678901" }),
    ]);
  });

  it("redacts every supported PII type with the configured replacement", () => {
    const text =
      "alice@example.com 555-123-4567 4111111111111111, 123-45-6789 10.0.0.1 12345678901";

    expect(redactPII(text, "[MASKED]")).toBe(
      "***@***.*** ***-***-**** [MASKED], [MASKED] [MASKED] [MASKED]"
    );
  });
});
