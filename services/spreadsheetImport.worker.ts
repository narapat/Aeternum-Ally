/// <reference lib="webworker" />

import readXlsxFile from 'read-excel-file/web-worker';
import { spreadsheetLimitError } from './spreadsheetPolicy.ts';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const sheets = await readXlsxFile(event.data.buffer);
    const limitError = spreadsheetLimitError(sheets);
    if (limitError) {
      self.postMessage({ ok: false, error: limitError });
      return;
    }
    self.postMessage({ ok: true, sheets });
  } catch {
    self.postMessage({
      ok: false,
      error: 'Spreadsheet is malformed or uses an unsupported format.',
    });
  }
};

export {};
