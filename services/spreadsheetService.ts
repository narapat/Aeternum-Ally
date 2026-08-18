import Papa from 'papaparse';
import writeXlsxFile, {
  type Cell,
  type Sheet,
  type SheetData,
} from 'write-excel-file/browser';
import {
  SPREADSHEET_LIMITS,
  spreadsheetLimitError,
  type ParsedSpreadsheetSheet,
} from './spreadsheetPolicy.ts';

export { SPREADSHEET_LIMITS } from './spreadsheetPolicy.ts';

export type SpreadsheetCellValue = string | number | boolean | Date | null;
export type SpreadsheetRow = SpreadsheetCellValue[];
export type SpreadsheetRecord = Record<string, SpreadsheetCellValue>;

export interface SpreadsheetFileMetadata {
  name: string;
  size: number;
  type?: string;
}

export interface SpreadsheetExportSheet {
  name: string;
  rows: SpreadsheetRow[];
  columnWidths?: number[];
}

type ParsedSheet = ParsedSpreadsheetSheet;

type SpreadsheetWorkerResponse =
  | { ok: true; sheets: ParsedSheet[] }
  | { ok: false; error: string };

const ALLOWED_MIME_TYPES: Record<'xlsx' | 'csv', Set<string>> = {
  xlsx: new Set([
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ]),
  csv: new Set([
    'application/csv',
    'application/octet-stream',
    'application/vnd.ms-excel',
    'text/csv',
    'text/plain',
  ]),
};

const DANGEROUS_HEADERS = new Set(['__proto__', 'constructor', 'prototype']);

function extensionFor(name: string): 'xlsx' | 'csv' | null {
  const normalized = name.trim().toLowerCase();
  if (normalized.endsWith('.xlsx')) return 'xlsx';
  if (normalized.endsWith('.csv')) return 'csv';
  return null;
}

export function validateSpreadsheetFile(file: SpreadsheetFileMetadata): 'xlsx' | 'csv' {
  const extension = extensionFor(file.name);
  if (!extension) {
    throw new Error('Only .xlsx and .csv files are supported.');
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error('The selected spreadsheet is empty or invalid.');
  }
  if (file.size > SPREADSHEET_LIMITS.maxBytes) {
    throw new Error('Spreadsheet files must be 2 MB or smaller.');
  }

  const mimeType = file.type?.trim().toLowerCase();
  if (mimeType && !ALLOWED_MIME_TYPES[extension].has(mimeType)) {
    throw new Error(`The selected file type does not match a .${extension} spreadsheet.`);
  }
  return extension;
}

function normalizeCell(value: unknown): SpreadsheetCellValue {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Spreadsheet contains an invalid date.');
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    if (value.length > SPREADSHEET_LIMITS.maxCellCharacters) {
      throw new Error('Spreadsheet contains a cell that is too long.');
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Spreadsheet contains an invalid number.');
    return value;
  }
  if (typeof value === 'boolean') return value;
  throw new Error('Spreadsheet contains an unsupported cell value.');
}

function hasValue(row: SpreadsheetRow): boolean {
  return row.some(value => value !== null && String(value).trim() !== '');
}

function normalizeRows(rows: unknown[][]): SpreadsheetRow[] {
  return rows
    .map(row => row.map(normalizeCell))
    .filter(hasValue);
}

export function spreadsheetRowsToRecords(inputRows: unknown[][]): SpreadsheetRecord[] {
  const rows = normalizeRows(inputRows);
  if (rows.length < 2) throw new Error('Spreadsheet is empty.');
  if (rows.length - 1 > SPREADSHEET_LIMITS.maxRows) {
    throw new Error(`Spreadsheet exceeds the ${SPREADSHEET_LIMITS.maxRows.toLocaleString()} row limit.`);
  }

  const headerRow = rows[0];
  if (headerRow.length === 0 || headerRow.length > SPREADSHEET_LIMITS.maxColumns) {
    throw new Error(`Spreadsheet must contain between 1 and ${SPREADSHEET_LIMITS.maxColumns} columns.`);
  }

  const headers = headerRow.map(value => String(value ?? '').trim());
  if (headers.some(header => !header)) throw new Error('Spreadsheet contains a blank column header.');

  const normalizedHeaders = headers.map(header => header.toLowerCase());
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error('Spreadsheet contains duplicate column headers.');
  }
  if (normalizedHeaders.some(header => DANGEROUS_HEADERS.has(header))) {
    throw new Error('Spreadsheet contains a reserved column header.');
  }

  return rows.slice(1).map(row => {
    if (row.length > SPREADSHEET_LIMITS.maxColumns) {
      throw new Error(`Spreadsheet exceeds the ${SPREADSHEET_LIMITS.maxColumns} column limit.`);
    }
    const record = Object.create(null) as SpreadsheetRecord;
    headers.forEach((header, index) => {
      record[header] = row[index] ?? null;
    });
    return record;
  });
}

export function parseCsvText(text: string): SpreadsheetRecord[] {
  const result = Papa.parse<unknown[]>(text, {
    delimiter: ',',
    skipEmptyLines: 'greedy',
  });
  if (result.errors.length > 0) {
    throw new Error(`CSV could not be parsed: ${result.errors[0].message}`);
  }
  return spreadsheetRowsToRecords(result.data);
}

export function spreadsheetSheetsToRecords(sheets: ParsedSheet[]): SpreadsheetRecord[] {
  const limitError = spreadsheetLimitError(sheets);
  if (limitError) throw new Error(limitError);
  return spreadsheetRowsToRecords(sheets[0].data);
}

function parseXlsxInWorker(buffer: ArrayBuffer): Promise<ParsedSheet[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./spreadsheetImport.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('Spreadsheet parsing timed out. Try a smaller file.'));
    }, SPREADSHEET_LIMITS.parseTimeoutMs);

    const cleanup = () => {
      window.clearTimeout(timer);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<SpreadsheetWorkerResponse>) => {
      cleanup();
      const response = event.data;
      if (response.ok === true) resolve(response.sheets);
      else reject(new Error(response.error));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('Spreadsheet could not be parsed safely.'));
    };
    worker.postMessage({ buffer }, [buffer]);
  });
}

export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetRecord[]> {
  const extension = validateSpreadsheetFile(file);
  const buffer = await file.arrayBuffer();
  if (extension === 'csv') {
    return parseCsvText(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  }

  const sheets = await parseXlsxInWorker(buffer);
  return spreadsheetSheetsToRecords(sheets);
}

function exportCell(value: SpreadsheetCellValue): Cell {
  if (typeof value === 'string') return { value, type: String };
  return value;
}

export async function downloadSpreadsheet(
  fileName: string,
  sheets: SpreadsheetExportSheet[],
): Promise<void> {
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Spreadsheet exports must use an .xlsx file name.');
  }
  if (sheets.length === 0 || sheets.length > SPREADSHEET_LIMITS.maxSheets) {
    throw new Error(`Spreadsheet exports must contain 1 to ${SPREADSHEET_LIMITS.maxSheets} sheets.`);
  }

  const output: Sheet<File>[] = sheets.map(sheet => ({
    sheet: sheet.name,
    data: sheet.rows.map(row => row.map(exportCell)) as SheetData,
    columns: sheet.columnWidths?.map(width => ({ width })),
    stickyRowsCount: 1,
  }));
  await writeXlsxFile(output).toFile(fileName);
}
