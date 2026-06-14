const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

// US-centric, intentionally broad for MVP masking.
const PHONE_REGEX = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;

const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

const LABELED_SSN_REGEX = /(\b(?:ssn|social security)\b[^0-9]{0,10})(\d{9})/gi;

const LABELED_ROUTING_REGEX =
  /(\b(?:routing(?:\s*number)?|aba)\b[^0-9]{0,15})([0-9][0-9\s-]{7,30})/gi;

const LABELED_ACCOUNT_NUMBER_REGEX =
  /(\b(?:account(?:\s*number)?|acct(?:\.|)?|a\/c)\b[^0-9]{0,20})([0-9][0-9\s-]{6,34})/gi;

const LONG_DIGIT_RUN_REGEX = /\b\d{7,}\b/g;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function maskKeepLast4(digits: string): string {
  if (digits.length <= 4) return digits;
  return `****${digits.slice(-4)}`;
}

export function enforceLast4AccountNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = digitsOnly(value);
  if (digits.length === 0) return null;
  return digits.slice(-4);
}

/**
 * Redact high-risk PII patterns while preserving accounting utility.
 * This is intentionally "minimum viable" and is not anonymization.
 */
export function redactHighRiskPII(text: string): string {
  let redacted = text;

  redacted = redacted.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
  redacted = redacted.replace(PHONE_REGEX, '[REDACTED_PHONE]');

  redacted = redacted.replace(SSN_REGEX, '[REDACTED_SSN]');
  redacted = redacted.replace(LABELED_SSN_REGEX, (_, prefix: string) => `${prefix}[REDACTED_SSN]`);

  redacted = redacted.replace(
    LABELED_ROUTING_REGEX,
    (match, prefix: string, numberPart: string) => {
      const digits = digitsOnly(numberPart);
      if (digits.length < 9) return match;
      return `${prefix}[REDACTED_ROUTING]`;
    },
  );

  redacted = redacted.replace(
    LABELED_ACCOUNT_NUMBER_REGEX,
    (match, prefix: string, numberPart: string) => {
      const digits = digitsOnly(numberPart);
      if (digits.length < 8) return match;
      return `${prefix}${maskKeepLast4(digits)}`;
    },
  );

  return redacted;
}

/**
 * Used for AI categorization prompts. More aggressive than statement-text redaction:
 * - Masks emails/phones/SSNs/routing
 * - Masks long digit runs (> 6 digits) to reduce accidental inclusion of identifiers
 */
export function sanitizeForAICategorization(description: string): string {
  const redacted = redactHighRiskPII(description).replace(
    LONG_DIGIT_RUN_REGEX,
    '[REDACTED_NUMBER]',
  );
  return redacted.replace(/\s+/g, ' ').trim();
}
