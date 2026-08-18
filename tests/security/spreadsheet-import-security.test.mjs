import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import readXlsxFile from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";

import {
  SPREADSHEET_LIMITS,
  parseCsvText,
  parseSpreadsheetFile,
  spreadsheetRowsToRecords,
  spreadsheetSheetsToRecords,
  validateSpreadsheetFile,
} from "../../services/spreadsheetService.ts";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

test("spreadsheet metadata validation rejects unsupported, empty, oversized, and mismatched files", () => {
  assert.throws(
    () => validateSpreadsheetFile({ name: "tasks.xls", size: 100, type: "application/vnd.ms-excel" }),
    /Only \.xlsx and \.csv/,
  );
  assert.throws(
    () => validateSpreadsheetFile({ name: "tasks.xlsx", size: 0, type: XLSX_MIME }),
    /empty or invalid/,
  );
  assert.throws(
    () => validateSpreadsheetFile({
      name: "tasks.xlsx",
      size: SPREADSHEET_LIMITS.maxBytes + 1,
      type: XLSX_MIME,
    }),
    /2 MB or smaller/,
  );
  assert.throws(
    () => validateSpreadsheetFile({ name: "tasks.xlsx", size: 100, type: "text/csv" }),
    /does not match/,
  );
});

test("oversized files are rejected before arrayBuffer reads untrusted bytes", async () => {
  let arrayBufferCalls = 0;
  const oversizedFile = {
    name: "oversized.xlsx",
    size: SPREADSHEET_LIMITS.maxBytes + 1,
    type: XLSX_MIME,
    async arrayBuffer() {
      arrayBufferCalls++;
      return new ArrayBuffer(0);
    },
  };

  await assert.rejects(
    parseSpreadsheetFile(oversizedFile),
    /2 MB or smaller/,
  );
  assert.equal(arrayBufferCalls, 0);
});

test("spreadsheet records reject empty, excessive, duplicate, and prototype-sensitive input", () => {
  assert.throws(() => spreadsheetRowsToRecords([]), /empty/);
  assert.throws(
    () => spreadsheetRowsToRecords([["A", "a"], ["1", "2"]]),
    /duplicate column headers/,
  );
  assert.throws(
    () => spreadsheetRowsToRecords([["__proto__"], ["polluted"]]),
    /reserved column header/,
  );
  assert.throws(
    () => spreadsheetRowsToRecords([
      ["Task ID"],
      ...Array.from({ length: SPREADSHEET_LIMITS.maxRows + 1 }, (_, index) => [String(index)]),
    ]),
    /row limit/,
  );
  assert.throws(
    () => spreadsheetRowsToRecords([
      Array.from({ length: SPREADSHEET_LIMITS.maxColumns + 1 }, (_, index) => `Column ${index}`),
      ["value"],
    ]),
    /columns/,
  );
  assert.equal(Object.prototype.polluted, undefined);
});

test("record conversion uses null-prototype objects and normalizes spreadsheet dates", () => {
  const records = spreadsheetRowsToRecords([
    ["Task ID", "Due Date", "Notes"],
    ["task-1", new Date("2026-08-18T00:00:00.000Z"), "line one"],
  ]);

  assert.equal(Object.getPrototypeOf(records[0]), null);
  assert.deepEqual({ ...records[0] }, {
    "Task ID": "task-1",
    "Due Date": "2026-08-18",
    Notes: "line one",
  });
});

test("workbook validation enforces sheet count before records are returned", () => {
  const validSheet = { sheet: "Tasks", data: [["Task ID"], ["task-1"]] };
  assert.equal(spreadsheetSheetsToRecords([validSheet]).length, 1);
  assert.throws(
    () => spreadsheetSheetsToRecords([validSheet, validSheet, validSheet]),
    /sheet limit/,
  );
  assert.throws(
    () => spreadsheetSheetsToRecords([{
      sheet: "Tasks",
      data: [["Task ID"], ["x".repeat(SPREADSHEET_LIMITS.maxCellCharacters + 1)]],
    }]),
    /cell that is too long/,
  );
});

test("CSV parser handles quoted commas and newlines without ad hoc splitting", () => {
  const records = parseCsvText([
    "Task ID,Status,Notes",
    'task-1,todo,"First line, with comma',
    'and a second line"',
  ].join("\n"));

  assert.equal(records.length, 1);
  assert.equal(records[0]["Task ID"], "task-1");
  assert.equal(records[0].Notes, "First line, with comma\nand a second line");
});

test("replacement XLSX libraries preserve Carbon and Task export/import contracts", async () => {
  const taskWorkbook = await writeXlsxFile([
    {
      sheet: "Tasks",
      data: [
        ["Task ID", "Status", "Notes"],
        ["task-1", "in_progress", "Quarterly evidence"],
      ],
    },
    {
      sheet: "Instructions",
      data: [["AeternumAlly Task Export/Import"]],
    },
  ]).toBuffer();

  const taskSheets = await readXlsxFile(taskWorkbook);
  const taskRecords = spreadsheetSheetsToRecords(taskSheets);
  assert.equal(taskSheets.length, 2);
  assert.equal(taskSheets[0].sheet, "Tasks");
  assert.deepEqual({ ...taskRecords[0] }, {
    "Task ID": "task-1",
    Status: "in_progress",
    Notes: "Quarterly evidence",
  });

  const carbonWorkbook = await writeXlsxFile([{
    sheet: "Emissions",
    data: [
      ["Source Name", "Source ID", "Period Start (YYYY-MM-DD)", "Period End (YYYY-MM-DD)", "Activity Data", "Notes"],
      ["Grid electricity", "source-1", "2026-01-01", "2026-01-31", 250, "January bill"],
    ],
  }]).toBuffer();
  const carbonRecords = spreadsheetSheetsToRecords(await readXlsxFile(carbonWorkbook));
  assert.deepEqual({ ...carbonRecords[0] }, {
    "Source Name": "Grid electricity",
    "Source ID": "source-1",
    "Period Start (YYYY-MM-DD)": "2026-01-01",
    "Period End (YYYY-MM-DD)": "2026-01-31",
    "Activity Data": 250,
    Notes: "January bill",
  });
});

test("malformed XLSX input rejects without exposing parser internals", async () => {
  await assert.rejects(
    readXlsxFile(Buffer.from("not-an-xlsx")),
  );
});

test("runtime source and dependency manifest no longer use vulnerable SheetJS xlsx", async () => {
  const [carbonSource, taskSource, workerSource, packageSource, lockSource] = await Promise.all([
    readFile(new URL("../../components/CarbonDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/TaskManagement.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../services/spreadsheetImport.worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../package-lock.json", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const packageLock = JSON.parse(lockSource);

  assert.match(carbonSource, /parseSpreadsheetFile\(file\)/);
  assert.match(taskSource, /parseSpreadsheetFile\(file\)/);
  assert.match(workerSource, /read-excel-file\/web-worker/);
  assert.doesNotMatch(`${carbonSource}\n${taskSource}`, /from ['"]xlsx['"]|XLSX\./);
  assert.equal(packageJson.dependencies.xlsx, undefined);
  assert.equal(packageLock.packages["node_modules/xlsx"], undefined);
});

test("spreadsheet rejection occurs before task import database writes", async () => {
  const taskSource = await readFile(
    new URL("../../components/TaskManagement.tsx", import.meta.url),
    "utf8",
  );
  const helper = taskSource.match(
    /async function parseAndApplyImport[\s\S]+?return result;\n}/,
  );

  assert.ok(helper);
  assert.ok(helper[0].indexOf("parseSpreadsheetFile(file)") < helper[0].indexOf("upsertTask(orgId"));
});
