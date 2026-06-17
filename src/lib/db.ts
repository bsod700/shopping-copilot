/**
 * @fileoverview Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter instead of a direct connection string.
 * The singleton pattern prevents new PrismaClient instances from being created
 * on every hot-reload in development (Next.js re-evaluates modules on each
 * request otherwise, quickly exhausting SQLite connections).
 *
 * Class name is `PrismaBetterSqlite3` — wrong casing throws "is not a constructor"
 * at runtime with no helpful message, so the exact import is documented here.
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaBetterSqlite3({ url: env.DATABASE_URL });

/** Shared Prisma client. Use this throughout the app — never instantiate PrismaClient directly. */
export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
