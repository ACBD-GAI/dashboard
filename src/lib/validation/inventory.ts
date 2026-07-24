import { z } from "zod";

export const siSchema = z
  .string()
  .trim()
  .max(80, "SI must be 80 characters or fewer.");

export const emailSchema = z.string().trim().email("Enter a valid email address.");
