export function toUtcDateFromYmd(dateStr: string) {
  const [y = 0, m = 1, d = 1] = dateStr.split('-').map(Number);
  // Use midday UTC to avoid local-timezone rollbacks when rendered with toLocaleDateString
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
}
