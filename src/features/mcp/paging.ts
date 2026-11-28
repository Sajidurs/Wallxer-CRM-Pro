import { z } from "zod";

export const pageField = z
  .number()
  .int()
  .min(1)
  .max(10_000)
  .default(1)
  .describe("Page number, starting at 1");

export const limitField = z
  .number()
  .int()
  .min(1)
  .max(50)
  .default(25)
  .describe("How many rows to return, at most 50");
