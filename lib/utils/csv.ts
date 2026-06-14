function neutralizeCsvFormula(value: string): string {
  if (/^\s*[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function inferCsvDelimiter(headerLine: string): string {
  const candidates = [',', '\t', ';'];
  let best = ',';
  let bestCount = -1;

  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

export function parseCsvRows(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let justClosedQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (!inQuotes && justClosedQuote) {
      if (char === delimiter) {
        row.push(field);
        field = '';
        justClosedQuote = false;
        continue;
      }

      if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        justClosedQuote = false;
        continue;
      }

      if (char === '\r') {
        continue;
      }

      if (char === ' ' || char === '\t') {
        continue;
      }

      throw new Error('Invalid CSV: unexpected character after closing quote');
    }

    if (inQuotes) {
      if (char === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field === '') {
        inQuotes = true;
      } else {
        field += char;
      }
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error('Invalid CSV: unterminated quoted field');
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function csvTextToRecords(text: string): Record<string, string>[] {
  const sanitizedText = text.replace(/^\uFEFF/, '');
  const delimiter = inferCsvDelimiter(sanitizedText.split(/\r?\n/, 1)[0] ?? '');
  const rawRows = parseCsvRows(sanitizedText, delimiter);

  const nonEmptyRows = rawRows.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (nonEmptyRows.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const [headerRow, ...dataRows] = nonEmptyRows;
  if (!headerRow) {
    throw new Error('CSV header row is empty');
  }
  const headers = headerRow.map((header) => header.trim());
  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    throw new Error('CSV header row is empty');
  }

  return dataRows.map((dataRow) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i] ?? '';
      if (!header) continue;
      record[header] = (dataRow[i] ?? '').toString();
    }
    return record;
  });
}

export function csvEscape(value: string | number | Date | null | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }

  const str =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : typeof value === 'string'
        ? neutralizeCsvFormula(value)
        : String(value);

  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function buildCsv(
  header: Array<string | number>,
  rows: Array<Array<string | number | Date | null | undefined>>,
): string {
  const headerLine = header.map((value) => csvEscape(value)).join(',');
  const bodyLines = rows.map((row) => row.map((value) => csvEscape(value)).join(','));
  return [headerLine, ...bodyLines].join('\n');
}
