export const SPREADSHEET_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxSheets: 2,
  maxRows: 1_000,
  maxColumns: 50,
  maxCellCharacters: 10_000,
  parseTimeoutMs: 8_000,
});

export interface ParsedSpreadsheetSheet {
  sheet: string;
  data: unknown[][];
}

export function spreadsheetLimitError(sheets: ParsedSpreadsheetSheet[]): string | null {
  if (sheets.length === 0) return 'Spreadsheet contains no worksheets.';
  if (sheets.length > SPREADSHEET_LIMITS.maxSheets) {
    return `Spreadsheet exceeds the ${SPREADSHEET_LIMITS.maxSheets} sheet limit.`;
  }
  if (sheets.some(sheet => sheet.data.length - 1 > SPREADSHEET_LIMITS.maxRows)) {
    return `Spreadsheet exceeds the ${SPREADSHEET_LIMITS.maxRows.toLocaleString()} row limit.`;
  }
  if (sheets.some(sheet => sheet.data.some(row => row.length > SPREADSHEET_LIMITS.maxColumns))) {
    return `Spreadsheet exceeds the ${SPREADSHEET_LIMITS.maxColumns} column limit.`;
  }
  if (sheets.some(sheet => sheet.data.some(row => row.some(
    value => typeof value === 'string' && value.length > SPREADSHEET_LIMITS.maxCellCharacters,
  )))) {
    return 'Spreadsheet contains a cell that is too long.';
  }
  return null;
}
