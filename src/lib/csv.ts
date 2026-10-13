export type CsvRecord = Record<string, string>;

export function parseCsv(source: string): CsvRecord[] {
  const input = source.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      if (char === "\r" && input[i + 1] === "\n") i++;
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (!rows.length) throw new Error("CSV is empty");

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  if (headers.some((header) => !header))
    throw new Error("CSV header row contains an empty column name");
  const normalized = headers.map((header) => header.toLowerCase());
  if (new Set(normalized).size !== normalized.length)
    throw new Error("CSV header row contains duplicate column names");

  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(
        `CSV row ${index + 2} has ${values.length} columns; expected ${headers.length}`,
      );
    return Object.fromEntries(
      headers.map((header, column) => [header, values[column].trim()]),
    );
  });
}
