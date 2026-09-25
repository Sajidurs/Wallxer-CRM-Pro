import { z } from "zod";

import { contactSchema, type ContactValues } from "../schema";

/**
 * CSV parsing and column mapping for the contact importer.
 *
 * Deliberately no CSV library. The format is simple, the one part that trips
 * hand-written parsers is quoted fields containing commas and newlines, and
 * that is handled below in about thirty lines. A dependency would be larger
 * than the problem.
 */

/**
 * Splits CSV text into rows of cells, honouring RFC 4180 quoting: a quoted
 * field may contain commas, newlines, and doubled quotes.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  // Strip a UTF-8 BOM, which Excel writes and which otherwise becomes part of
  // the first header name and stops it matching anything.
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // Ignored; the \n that follows ends the row.
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  // A file that does not end in a newline still has a last row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** The fields an import can fill. Anything else in the file is ignored. */
export const IMPORT_FIELDS = [
  "firstName",
  "lastName",
  "companyName",
  "jobTitle",
  "email",
  "phone",
  "whatsapp",
  "website",
  "source",
  "notes",
  "tags",
  "street",
  "city",
  "state",
  "country",
  "postal",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  firstName: "First name",
  lastName: "Last name",
  companyName: "Company",
  jobTitle: "Job title",
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
  website: "Website",
  source: "Source",
  notes: "Notes",
  tags: "Tags",
  street: "Street",
  city: "City",
  state: "State or region",
  country: "Country",
  postal: "Postal code",
};

/**
 * Header names seen in real exports, lowercased and stripped of punctuation.
 * Guessing the mapping saves the tedious part of an import; the UI still shows
 * every guess so a wrong one can be corrected before anything is written.
 */
const HEADER_HINTS: Record<ImportField, string[]> = {
  firstName: ["first name", "firstname", "first", "given name", "forename"],
  lastName: ["last name", "lastname", "last", "surname", "family name"],
  companyName: ["company", "company name", "organisation", "organization", "business", "account"],
  jobTitle: ["job title", "title", "position", "role", "designation"],
  email: ["email", "email address", "e mail", "mail", "primary email"],
  phone: ["phone", "phone number", "telephone", "tel", "mobile", "contact number"],
  whatsapp: ["whatsapp", "whats app", "wa"],
  website: ["website", "web", "url", "site", "homepage"],
  source: ["source", "lead source", "origin", "referred by"],
  notes: ["notes", "note", "comments", "description", "remarks"],
  tags: ["tags", "tag", "labels", "categories"],
  street: ["street", "address", "address line 1", "street address"],
  city: ["city", "town"],
  state: ["state", "region", "province", "county"],
  country: ["country"],
  postal: ["postal", "postcode", "post code", "zip", "zip code", "postal code"],
};

function normaliseHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best guess at which column feeds which field. Returns an array parallel to
 * the headers: the field a column maps to, or null to ignore it.
 */
export function guessMapping(headers: string[]): (ImportField | null)[] {
  const taken = new Set<ImportField>();

  return headers.map((header) => {
    const normalised = normaliseHeader(header);

    for (const field of IMPORT_FIELDS) {
      if (taken.has(field)) continue;
      if (HEADER_HINTS[field].includes(normalised)) {
        taken.add(field);
        return field;
      }
    }

    // Looser pass, so "Client Email Address" still finds `email`. Only run
    // after every exact match has claimed its column.
    for (const field of IMPORT_FIELDS) {
      if (taken.has(field)) continue;
      if (HEADER_HINTS[field].some((hint) => normalised.includes(hint))) {
        taken.add(field);
        return field;
      }
    }

    return null;
  });
}

export interface MappedRow {
  /** 1-based, counting the header, so it matches what a spreadsheet shows. */
  line: number;
  values: Partial<Record<ImportField, string>>;
}

export function mapRows(
  rows: string[][],
  mapping: (ImportField | null)[],
): MappedRow[] {
  return rows.slice(1).map((cells, index) => {
    const values: Partial<Record<ImportField, string>> = {};

    mapping.forEach((field, column) => {
      if (!field) return;
      const cell = cells[column];
      if (cell !== undefined && cell.trim() !== "") {
        values[field] = cell.trim();
      }
    });

    return { line: index + 2, values };
  });
}

/**
 * Turns a mapped row into something `contactSchema` can validate.
 *
 * Section 8.2 is explicit: the import must write through the same schema and
 * the same server action as the manual form, so validation cannot diverge. This
 * function only shapes the row; it does not decide what is valid.
 */
export function toContactInput(row: MappedRow) {
  const { values } = row;

  // A row with a company and no personal name is a company, not a nameless
  // person. Getting this wrong would fail the name check constraint on rows
  // that are perfectly importable.
  const hasPersonName = Boolean(values.firstName || values.lastName);
  const type = hasPersonName ? "person" : values.companyName ? "company" : "person";

  return {
    type,
    firstName: values.firstName ?? "",
    lastName: values.lastName ?? "",
    companyName: values.companyName ?? "",
    jobTitle: values.jobTitle ?? "",
    email: values.email ?? "",
    phone: values.phone ?? "",
    whatsapp: values.whatsapp ?? "",
    website: values.website ?? "",
    status: "lead" as const,
    source: values.source ?? "",
    notes: values.notes ?? "",
    // Accepts "vip, retainer" and "vip; retainer", which both appear in real
    // exports.
    tags: values.tags
      ? values.tags
          .split(/[;,]/)
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 25)
      : [],
    brandId: null,
    ownerId: null,
    parentContactId: null,
    address: {
      street: values.street ?? "",
      city: values.city ?? "",
      state: values.state ?? "",
      country: values.country ?? "",
      postal: values.postal ?? "",
    },
  };
}

export interface RowOutcome {
  line: number;
  /** created, updated, skipped (no name), or failed (validation) */
  outcome: "created" | "updated" | "skipped" | "failed";
  label: string;
  reason?: string;
}

/** Validates one mapped row without touching the database. */
export function validateRow(
  row: MappedRow,
): { ok: true; values: ContactValues } | { ok: false; reason: string } {
  const parsed = contactSchema.safeParse(toContactInput(row));

  if (parsed.success) return { ok: true, values: parsed.data };

  const issue = parsed.error.issues[0];
  return {
    ok: false,
    reason: issue
      ? `${issue.path.join(".") || "row"}: ${issue.message}`
      : "Could not be read",
  };
}

export const importOptionsSchema = z.object({
  /** Update an existing contact when the email matches, rather than skipping. */
  updateExisting: z.boolean().default(true),
  ownerId: z.uuid().nullable().optional(),
  brandId: z.uuid().nullable().optional(),
  status: z.enum(["lead", "active", "inactive", "archived"]).default("lead"),
});

export type ImportOptions = z.output<typeof importOptionsSchema>;
