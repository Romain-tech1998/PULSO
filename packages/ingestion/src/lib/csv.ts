/**
 * Minimal dependency-free CSV parser supporting quoted fields, embedded commas,
 * embedded newlines, and escaped quotes (""). Good enough for well-formed
 * government open-data exports; not a general-purpose CSV library.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0) || rows.length === 0) {
        rows.push(row);
      }
      row = [];
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body
    .filter((line) => line.length === header.length)
    .map((line) =>
      Object.fromEntries(header.map((key, index) => [key, line[index] ?? '']))
    );
}
