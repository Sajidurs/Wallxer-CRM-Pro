import "server-only";

import readXlsxFile from "read-excel-file/node";

import { rowsToCsv } from "./csv";

/**
 * Excel in, CSV out.
 *
 * The importer already has a parser, a mapping step and a server-side import
 * that re-parses what the browser sent. Rather than build a second pipeline for
 * spreadsheets, an uploaded `.xlsx` is converted to CSV here and fed into the
 * one that exists — so Excel and CSV take exactly the same path from mapping
 * onwards, and there is no second place for the two to disagree.
 *
 * Server-side on purpose. Parsing in the browser would ship a spreadsheet
 * library to every visitor for a page most of them never open.
 *
 * A CSV parser is thirty lines, which is why this project has its own. A
 * `.xlsx` is a ZIP of XML with shared string tables and a dozen cell encodings;
 * there the dependency is smaller than the problem.
 */

/** Everything a cell can come back as, rendered the way a person wrote it. */
function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // Dates only reach here if Excel typed the column that way. ISO keeps them
    // unambiguous; nothing the contact importer reads is a date anyway.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

export interface XlsxResult {
  csv: string;
  /** How many rows carried anything, header included. */
  rowCount: number;
  sheetName: string | null;
}

export async function xlsxToCsv(buffer: Buffer): Promise<XlsxResult> {
  // Returns one entry per sheet. Only the first is imported: a workbook's
  // later tabs are usually notes or a pivot, and silently concatenating them
  // would invent contacts nobody listed.
  const sheets = await readXlsxFile(buffer);
  const first = sheets[0];

  if (!first) {
    return { csv: "", rowCount: 0, sheetName: null };
  }

  const sheetName = first.sheet ?? null;

  const text = first.data
    .map((row) => (Array.isArray(row) ? row.map(cellToText) : []))
    // A spreadsheet is full of blank rows below the data; they would each
    // become an empty contact.
    .filter((row) => row.some((cell) => cell !== ""));

  return {
    csv: rowsToCsv(text),
    rowCount: text.length,
    sheetName,
  };
}
