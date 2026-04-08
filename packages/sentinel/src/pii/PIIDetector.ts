export interface PIIMatch {
  type: "email" | "phone" | "creditCard" | "ssn" | "ipv4" | "tcKimlik";
  value: string;
  index: number;
}

const PII_PATTERNS: Record<PIIMatch["type"], RegExp> = {
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  phone: /(?:\+?90[\s-]?)?(?:\(?0?5\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b)/g,
  creditCard: /\b(?:\d[ -]?){13,16}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  tcKimlik: /\b[1-9]\d{10}\b/g
};

export function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];

  for (const [type, pattern] of Object.entries(PII_PATTERNS) as Array<[PIIMatch["type"], RegExp]>) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }

      matches.push({
        type,
        value: match[0],
        index: match.index
      });
    }
  }

  return matches.sort((left, right) => left.index - right.index);
}

export function redactPII(text: string, replacement = "[REDACTED]"): string {
  let redacted = text;

  redacted = redacted.replace(PII_PATTERNS.email, "***@***.***");
  redacted = redacted.replace(PII_PATTERNS.phone, "***-***-****");
  redacted = redacted.replace(PII_PATTERNS.creditCard, replacement);
  redacted = redacted.replace(PII_PATTERNS.ssn, replacement);
  redacted = redacted.replace(PII_PATTERNS.ipv4, replacement);
  redacted = redacted.replace(PII_PATTERNS.tcKimlik, replacement);

  return redacted;
}
