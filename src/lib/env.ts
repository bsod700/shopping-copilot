/**
 * @fileoverview Validated environment variables.
 *
 * Parse and validate required env vars at module load time so the app fails
 * fast with a clear message rather than crashing mid-request with a cryptic
 * "undefined" error. Import `env` instead of `process.env` everywhere.
 */
import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is missing, copy .env.example to .env and fill it in"),
  DATABASE_URL: z.string().min(1),
});

/** Validated, type-safe environment variables. Throws at startup if any are missing. */
export const env = envSchema.parse(process.env);
