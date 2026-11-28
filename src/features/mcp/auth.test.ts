import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateApiKey,
  hashApiKey,
  knownScopes,
  parseBearer,
  rejectionForKey,
  scopeDenial,
} from "./auth";
import { columnsAreMetadataOnly, ATTACHMENT_LIST_COLUMNS, CREDENTIAL_LIST_COLUMNS } from "./columns";
import { publicError, redact } from "./redact";

describe("api key material", () => {
  it("hashes the token and does not keep it in the hash", () => {
    const token = "wxm_example-key-value";
    const hash = hashApiKey(token);

    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash.includes("wxm_"), false);
    assert.equal(hash.includes(token), false);
    assert.equal(hashApiKey(token), hash);
    assert.notEqual(hashApiKey(`${token}x`), hash);
  });

  it("shows a prefix that is not the whole key", () => {
    const issued = generateApiKey();

    assert.match(issued.token, /^wxm_[A-Za-z0-9_-]+$/);
    assert.equal(issued.prefix, issued.token.slice(0, 12));
    assert.match(issued.prefix, /^wxm_[A-Za-z0-9_-]{4,12}$/);
    assert.match(issued.hash, /^[0-9a-f]{64}$/);
    assert.ok(issued.prefix.length < issued.token.length);
    assert.equal(issued.hash, hashApiKey(issued.token));
    assert.equal(issued.hash.includes(issued.token), false);
  });
});

describe("parseBearer", () => {
  it("accepts a single bearer key", () => {
    const parsed = parseBearer("Bearer wxm_abc123def456ghi789");
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.token, "wxm_abc123def456ghi789");
  });

  it("rejects a missing header, a basic scheme, and a short secret", () => {
    assert.equal(parseBearer(null).ok, false);
    assert.equal(parseBearer("Basic wxm_abc123def456ghi789").ok, false);
    assert.equal(parseBearer("Bearer wxm_short").ok, false);
    assert.equal(parseBearer("Bearer not-our-key-at-all").ok, false);
  });
});

describe("rejectionForKey", () => {
  const active = {
    found: true,
    revokedAt: null,
    profileStatus: "active" as const,
    workspaceMatch: true,
  };

  it("allows an active key in its workspace", () => {
    assert.equal(rejectionForKey(active), null);
  });

  it("does not treat a revoked key as unknown, and rejects everyone else", () => {
    assert.match(rejectionForKey({ ...active, found: false }) ?? "", /Invalid/);
    assert.match(
      rejectionForKey({ ...active, revokedAt: "2026-11-28T00:00:00Z" }) ?? "",
      /revoked/,
    );
    assert.match(
      rejectionForKey({ ...active, profileStatus: "suspended" }) ?? "",
      /not active/,
    );
    assert.match(rejectionForKey({ ...active, profileStatus: null }) ?? "", /not active/);
    assert.match(rejectionForKey({ ...active, workspaceMatch: false }) ?? "", /Invalid/);
  });
});

describe("scopeDenial", () => {
  const member = { role: "member" as const, status: "active" as const, finance_access: false };
  const financeMember = { ...member, finance_access: true };
  const admin = { role: "admin" as const, status: "active" as const, finance_access: false };

  it("lets write imply read, and nothing imply finance", () => {
    assert.equal(scopeDenial(["read"], member, { kind: "read" }), null);
    assert.equal(scopeDenial(["write"], member, { kind: "read" }), null);
    assert.match(scopeDenial(["read"], member, { kind: "write" }) ?? "", /write access/);
    assert.equal(
      scopeDenial(["write"], member, { kind: "write", resource: "contact", action: "create" }),
      null,
    );
    assert.match(scopeDenial(["write"], member, { kind: "finance-read" }) ?? "", /finance scope/);
    assert.match(scopeDenial(["read", "finance"], member, { kind: "finance-read" }) ?? "", /finance access/);
  });

  it("requires the finance scope and the profile grant, and write for money changes", () => {
    assert.equal(scopeDenial(["read", "finance"], financeMember, { kind: "finance-read" }), null);
    assert.match(
      scopeDenial(["read", "finance"], financeMember, { kind: "finance-write" }) ?? "",
      /write access/,
    );
    assert.equal(
      scopeDenial(["write", "finance"], financeMember, { kind: "finance-write" }),
      null,
    );
    assert.equal(scopeDenial(["read", "finance"], admin, { kind: "finance-read" }), null);
    assert.match(
      scopeDenial(["finance"], financeMember, { kind: "finance-read" }) ?? "",
      /read access/,
    );
  });

  it("keeps a member inside the role matrix", () => {
    assert.match(
      scopeDenial(["write"], member, { kind: "write", resource: "brand", action: "create" }) ?? "",
      /cannot do that/,
    );
    assert.equal(
      scopeDenial(["write"], admin, { kind: "write", resource: "brand", action: "create" }),
      null,
    );
  });

  it("ignores a scope the database should not have stored", () => {
    assert.deepEqual(knownScopes(["read", "delete", "finance"]), ["read", "finance"]);
    assert.match(scopeDenial(["delete"], member, { kind: "read" }) ?? "", /read access/);
    assert.match(
      scopeDenial(["read"], { ...member, status: "suspended" }, { kind: "read" }) ?? "",
      /not active/,
    );
  });
});

describe("redaction", () => {
  it("drops secret fields and key-shaped text", () => {
    const cleaned = redact({
      label: "Hosting",
      username: "ada",
      secret_encrypted: "ciphertext",
      notes_encrypted: "also secret",
      storage_path: "workspace/file",
      nested: { password: "nope", name: "ok" },
      note: "the key is wxm_abc123def456ghi789",
    }) as Record<string, unknown>;

    assert.equal("secret_encrypted" in cleaned, false);
    assert.equal("notes_encrypted" in cleaned, false);
    assert.equal("storage_path" in cleaned, false);
    assert.deepEqual(cleaned.nested, { name: "ok" });
    assert.equal(cleaned.note, "the key is [redacted]");
    assert.match(publicError("boom Bearer wxm_abc123def456ghi789"), /\[redacted\]/);
    assert.equal(publicError("boom Bearer wxm_abc123def456ghi789").includes("wxm_abc"), false);
  });

  it("keeps credential and attachment lists to metadata columns", () => {
    assert.equal(columnsAreMetadataOnly(CREDENTIAL_LIST_COLUMNS), true);
    assert.equal(columnsAreMetadataOnly(ATTACHMENT_LIST_COLUMNS), true);
    assert.equal(columnsAreMetadataOnly("id, secret_encrypted"), false);
    assert.equal(columnsAreMetadataOnly("*"), false);
    assert.equal(columnsAreMetadataOnly("id, storage_path"), false);
  });
});
