import { redactPII } from "../pii/PIIDetector.js";

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactPII(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, scrubValue(nested)])
    );
  }

  return value;
}

export class PiiScrubber {
  scrub<T>(value: T): T {
    return scrubValue(value) as T;
  }
}
