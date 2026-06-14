export function normalizeStatementDescription(description: string) {
  let normalized = description.toLowerCase().trim().replace(/\s+/g, ' ');

  normalized = normalized.replace(
    /(\s+(\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?|\d{4}-\d{2}-\d{2}))\s*$/,
    '',
  );

  normalized = normalized.replace(/[\s\-–—,.;:]+$/, '').trim();

  return normalized;
}
