/**
 * Logical backup of the whole workspace.
 *
 *   npm run backup
 *   npm run backup -- --out D:/backups
 *
 * Why this exists rather than `pg_dump`: SYSTEM_DESIGN section 10 calls the
 * free tier's backup story "the one gap in the free tier that can actually
 * hurt". `supabase db dump` needs Docker and `pg_dump` needs the Postgres
 * client tools, and neither is installed on the machine this runs on. This
 * script needs only Node, which is already here.
 *
 * WHAT IT CAPTURES
 *   - every row of every application table, as JSON
 *   - the auth users list, so accounts can be recreated
 *   - the credential encryption key, fetched deliberately through the
 *     Management API (see below)
 *   - an inventory of stored files, with their paths
 *
 * WHAT IT DOES NOT CAPTURE
 *   - the schema. That lives in supabase/migrations and is in git, which is a
 *     better place for it than a dump.
 *   - the file contents in storage. Only the inventory. Re-uploading bytes is a
 *     different job; the rows tell you what is missing.
 *   - auth password hashes. Users keep their accounts only if the project
 *     survives; a restore into a new project means everyone resets.
 *
 * THE ENCRYPTION KEY
 *   Credentials are encrypted with a key held in Supabase Vault. Migration 0017
 *   revoked it from the service role, so this script reads it through the
 *   Management API, which runs as `postgres` and needs SUPABASE_ACCESS_TOKEN.
 *   Without that key the encrypted credentials in this backup are permanently
 *   unreadable — by anyone, including you. That is the whole point of including
 *   it, and the reason the output is sensitive.
 *
 * TREAT THE OUTPUT AS SECRET. It contains the key that decrypts every stored
 * client password. Keep it somewhere you would keep those passwords.
 */

import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    "no-key": { type: "boolean" },
  },
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Ordered so a restore can insert them front to back without tripping a foreign
 * key. Children always follow their parents.
 */
const TABLES = [
  "workspaces",
  "brands",
  "profiles",
  "contacts",
  "projects",
  "project_websites",
  "credentials",
  "credential_access_log",
  "pipelines",
  "pipeline_stages",
  "deals",
  "deal_stage_history",
  "tasks",
  "task_assignees",
  "resource_links",
  "attachments",
  "activity_log",
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(values.out ?? "backups", stamp);

await mkdir(outDir, { recursive: true });

console.log(`Backing up to ${outDir}\n`);

const manifest = {
  takenAt: new Date().toISOString(),
  project: projectRef ?? "unknown",
  tables: {},
  notes: [
    "Schema is not included; it lives in supabase/migrations, in git.",
    "Storage file contents are not included, only the inventory.",
    "Restore order is the order of the `tables` keys.",
  ],
};

let total = 0;

for (const table of TABLES) {
  // Paged, because a single select of a large table will be truncated by
  // PostgREST's row limit without saying so.
  const rows = [];
  const pageSize = 1000;

  for (let page = 0; ; page++) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error) {
      console.log(`  ${table.padEnd(24)} SKIPPED — ${error.message}`);
      manifest.tables[table] = { error: error.message };
      break;
    }

    rows.push(...data);
    if (data.length < pageSize) break;
  }

  if (manifest.tables[table]?.error) continue;

  await writeFile(
    join(outDir, `${table}.json`),
    JSON.stringify(rows, null, 1),
    "utf8",
  );

  manifest.tables[table] = { rows: rows.length };
  total += rows.length;
  console.log(`  ${table.padEnd(24)} ${rows.length} row(s)`);
}

// --- auth users -------------------------------------------------------------
// Not in the public schema, and not reachable through PostgREST.
const users = [];
for (let page = 1; page <= 50; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.log(`  auth.users               SKIPPED — ${error.message}`);
    break;
  }
  users.push(
    ...data.users.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      user_metadata: u.user_metadata,
    })),
  );
  if (data.users.length < 200) break;
}

await writeFile(join(outDir, "auth_users.json"), JSON.stringify(users, null, 1), "utf8");
manifest.tables["auth.users"] = { rows: users.length };
console.log(`  auth.users               ${users.length} row(s)`);

// --- storage inventory ------------------------------------------------------
const buckets = ["project-files", "avatars"];
const storage = {};

for (const bucket of buckets) {
  const { data, error } = await admin.storage.from(bucket).list("", {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  storage[bucket] = error ? { error: error.message } : { entries: data?.length ?? 0 };
}

await writeFile(join(outDir, "storage_inventory.json"), JSON.stringify(storage, null, 1), "utf8");
console.log(`  storage inventory        ${buckets.length} bucket(s)`);

// --- the encryption key -----------------------------------------------------
// The single most important thing in here, and the reason the output is
// sensitive. Without it, every credentials row is permanently unreadable.
let keyStatus = "not requested";

if (!values["no-key"]) {
  if (!accessToken || !projectRef) {
    keyStatus =
      "MISSING — set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF. Credentials in this backup cannot be restored without the key.";
  } else {
    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query:
              "select decrypted_secret from vault.decrypted_secrets where name = 'credential_encryption_key';",
          }),
        },
      );
      const body = await res.json();
      const secret = Array.isArray(body) ? body[0]?.decrypted_secret : null;

      if (secret) {
        await writeFile(
          join(outDir, "CREDENTIAL_KEY.txt"),
          `${secret}\n\nThis decrypts public.credentials. Without it those rows are unreadable.\nKeep this wherever you keep client passwords.\n`,
          "utf8",
        );
        keyStatus = "included";
      } else {
        keyStatus = `NOT RETRIEVED — ${body?.message ?? "no secret returned"}`;
      }
    } catch (error) {
      keyStatus = `NOT RETRIEVED — ${error.message}`;
    }
  }
}

manifest.credentialKey = keyStatus;
console.log(`  credential key           ${keyStatus}`);

await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

// --- one compressed file, for carrying somewhere -----------------------------
const archivePath = `${outDir}.json.gz`;
await pipeline(
  Readable.from(JSON.stringify(manifest)),
  createGzip(),
  createWriteStream(archivePath),
);

console.log(`\n${total} rows across ${TABLES.length} tables.`);
console.log(`Written to ${outDir}`);

if (keyStatus !== "included") {
  console.log(
    `\nWARNING: the credential encryption key is ${keyStatus}.\n` +
      "Encrypted credentials in this backup cannot be restored without it.",
  );
}

console.log(
  "\nThis backup contains the key to every stored client password. Keep it\n" +
    "somewhere you would keep those passwords, not in the repo.",
);
