import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is missing, copy .env.example to .env and fill it in"),
  DATABASE_URL: z.string().min(1),
});

export const env = envSchema.parse(process.env);
