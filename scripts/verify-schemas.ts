/**
 * Asserts every Zod schema is idempotent: parse(parse(x)) succeeds and equals
 * parse(x).
 *
 *   npm run verify:schemas
 *
 * Why this exists. React Hook Form's `handleSubmit` hands the submit handler the
 * resolver's *output*, so a form submits transformed values. The server action
 * then re-validates that output with the same schema, because the client is not
 * trustworthy. If a schema turns "" into null on the way out but only accepts
 * `string | undefined` on the way in, the second parse fails on every empty
 * optional field and the user is told to "check the details below" while the
 * errors point at fields they never touched.
 *
 * That bug shipped in two modules before anything caught it, because the
 * end-to-end tests called the actions with hand-written raw input rather than
 * with what a form actually sends. A round trip is the check that would have
 * caught it, and it costs milliseconds.
 *
 * When you add a schema, add it here.
 */

import type { ZodType } from "zod";

import { loginSchema, setPasswordSchema } from "../src/features/auth/schema";
import {
  contactFiltersSchema,
  contactSchema,
  deleteContactSchema,
  updateContactSchema,
} from "../src/features/contacts/schema";
import {
  draftLinkSchema,
  resourceLinkSchema,
} from "../src/features/shared/resource-links/schema";
import {
  deleteTaskSchema,
  moveTaskSchema,
  taskFiltersSchema,
  taskSchema,
  updateTaskSchema,
} from "../src/features/tasks/schema";
import {
  changeRoleSchema,
  inviteUserSchema,
  resetPasswordSchema,
  setStatusSchema,
  updateOwnProfileSchema,
} from "../src/features/users/schema";

interface Case {
  name: string;
  schema: ZodType;
  /** Raw input, exactly as the form's defaultValues would produce it. */
  input: unknown;
}

const UUID = "00000000-0000-0000-0000-000000000000";

const cases: Case[] = [
  {
    name: "loginSchema",
    schema: loginSchema,
    input: { email: "someone@example.com", password: "hunter2hunter2" },
  },
  {
    name: "setPasswordSchema",
    schema: setPasswordSchema,
    input: { password: "averylongpassword", confirmPassword: "averylongpassword" },
  },
  {
    name: "inviteUserSchema (empty job title)",
    schema: inviteUserSchema,
    input: {
      email: "New.Person@Example.com",
      fullName: "  New Person  ",
      role: "member",
      jobTitle: "",
      delivery: "password",
    },
  },
  {
    name: "changeRoleSchema",
    schema: changeRoleSchema,
    input: { userId: UUID, role: "manager" },
  },
  {
    name: "setStatusSchema",
    schema: setStatusSchema,
    input: { userId: UUID, status: "suspended" },
  },
  {
    name: "resetPasswordSchema",
    schema: resetPasswordSchema,
    input: { userId: UUID },
  },
  {
    name: "updateOwnProfileSchema (empty phone and title)",
    schema: updateOwnProfileSchema,
    input: {
      fullName: "Sajidur Rahman",
      phone: "",
      jobTitle: "",
      timezone: "Asia/Dhaka",
    },
  },
  {
    name: "contactSchema (person, every optional blank)",
    schema: contactSchema,
    input: {
      type: "person",
      firstName: "Test",
      lastName: "Person",
      companyName: "",
      jobTitle: "",
      email: "",
      phone: "",
      whatsapp: "",
      website: "",
      status: "lead",
      source: "",
      notes: "",
      tags: [],
      brandId: null,
      ownerId: null,
      parentContactId: null,
      address: { street: "", city: "", state: "", country: "", postal: "" },
    },
  },
  {
    name: "contactSchema (company, fields filled)",
    schema: contactSchema,
    input: {
      type: "company",
      companyName: "Probe Industries",
      email: "Hello@Probe.Test",
      website: "https://probe.test",
      status: "active",
      tags: ["vip"],
      address: { city: "Dhaka", country: "Bangladesh" },
    },
  },
  {
    name: "updateContactSchema",
    schema: updateContactSchema,
    input: {
      id: UUID,
      values: {
        type: "person",
        firstName: "Test",
        lastName: "Person",
        status: "lead",
        tags: [],
        address: {},
      },
    },
  },
  {
    name: "deleteContactSchema",
    schema: deleteContactSchema,
    input: { id: UUID, deleted: true },
  },
  {
    name: "taskSchema (every optional blank)",
    schema: taskSchema,
    input: {
      title: "Probe task",
      description: "",
      status: "todo",
      priority: "medium",
      projectId: null,
      contactId: null,
      assigneeId: null,
      startAt: "",
      dueAt: "",
      estimatedMinutes: "",
      links: [],
    },
  },
  {
    name: "taskSchema (with links and an estimate)",
    schema: taskSchema,
    input: {
      title: "Probe task with links",
      status: "in_progress",
      priority: "urgent",
      estimatedMinutes: "90",
      links: [{ kind: "video", name: "Walkthrough", url: "loom.com/share/abc" }],
    },
  },
  {
    name: "updateTaskSchema",
    schema: updateTaskSchema,
    input: {
      id: UUID,
      values: { title: "Probe", status: "todo", priority: "low", links: [] },
    },
  },
  {
    name: "deleteTaskSchema",
    schema: deleteTaskSchema,
    input: { id: UUID, deleted: true },
  },
  {
    name: "moveTaskSchema",
    schema: moveTaskSchema,
    input: { id: UUID, status: "review", position: 1500 },
  },
  {
    name: "taskFiltersSchema",
    schema: taskFiltersSchema,
    input: { q: "probe", view: "board", page: "3" },
  },
  {
    name: "resourceLinkSchema (scheme added)",
    schema: resourceLinkSchema,
    input: {
      entityType: "task",
      entityId: UUID,
      kind: "document",
      name: "Spec",
      url: "docs.google.com/spec",
    },
  },
  {
    name: "draftLinkSchema",
    schema: draftLinkSchema,
    input: { kind: "reference", name: "Ref", url: "https://example.com/x" },
  },
  {
    name: "contactFiltersSchema",
    schema: contactFiltersSchema,
    input: { q: "boost", page: "2", sort: "name" },
  },
];

let failures = 0;

for (const testCase of cases) {
  const first = testCase.schema.safeParse(testCase.input);

  if (!first.success) {
    failures++;
    console.log(`FAIL  ${testCase.name}: first parse rejected valid input`);
    for (const issue of first.error.issues) {
      console.log(`        ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    continue;
  }

  const second = testCase.schema.safeParse(first.data);

  if (!second.success) {
    failures++;
    console.log(`FAIL  ${testCase.name}: re-parsing its own output was rejected`);
    for (const issue of second.error.issues) {
      console.log(`        ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    continue;
  }

  // Idempotent means stable, not merely accepted: a schema that keeps trimming
  // or re-defaulting on each pass would still be a bug waiting to surface.
  const a = JSON.stringify(first.data);
  const b = JSON.stringify(second.data);

  if (a !== b) {
    failures++;
    console.log(`FAIL  ${testCase.name}: output changed on the second parse`);
    console.log(`        1st: ${a}`);
    console.log(`        2nd: ${b}`);
    continue;
  }

  console.log(`PASS  ${testCase.name}`);
}

console.log(
  failures === 0
    ? `\n${cases.length}/${cases.length} schemas are idempotent`
    : `\n${failures} of ${cases.length} failed`,
);

process.exit(failures ? 1 : 0);
