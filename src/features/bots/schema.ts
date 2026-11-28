import { z } from "zod";

import { BOT_SCOPES } from "@/features/mcp/auth";

/**
 * Creating a bot key. The raw token is not an input: the server generates it
 * and returns it once. Scopes are the only authority this row adds on top of
 * the linked profile.
 */
export const createBotKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the key a name")
    .max(80, "That name is too long"),
  profileId: z.uuid("Choose who this key acts as"),
  scopes: z
    .array(z.enum(BOT_SCOPES))
    .min(1, "Choose at least one scope")
    .max(3)
    .refine((scopes) => new Set(scopes).size === scopes.length, "Choose each scope once"),
});

export type CreateBotKeyInput = z.input<typeof createBotKeySchema>;
export type CreateBotKeyValues = z.output<typeof createBotKeySchema>;

export const revokeBotKeySchema = z.object({
  id: z.uuid(),
});
