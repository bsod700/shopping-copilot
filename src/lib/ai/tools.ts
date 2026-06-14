import { tool } from "ai";
import { z } from "zod";
import {
  searchProducts as dummyjsonSearch,
  getProduct as dummyjsonGetProduct,
  listCategories as dummyjsonListCategories,
} from "@/lib/dummyjson";

// Tiny in-memory cache for tool results within a session (TTL 5 min).
// Keeps repeated/retried calls with the same input free of network round-trips.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { result: unknown; expiresAt: number }>();

async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result as T;
  }
  const result = await fn();
  cache.set(key, { result, expiresAt: Date.now() + TTL_MS });
  return result;
}

export const searchProducts = tool({
  description:
    "Search the product catalog. Use `query` for keyword search, `category` when the user names a category " +
    "(e.g. smartphones, skincare, furniture). Use sortBy/order='price'/'asc' for cheap/budget requests. " +
    "Only call this for physical retail products this shop might carry. Do not call it for services, " +
    "travel, digital goods, or anything clearly outside a product catalog.",
  inputSchema: z.object({
    query: z.string().optional().describe("Free-text search keywords"),
    category: z.string().optional().describe("Exact category slug, e.g. 'smartphones'"),
    sortBy: z.enum(["price", "rating", "title"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    limit: z.number().min(1).max(10).default(5),
  }),
  execute: async (input) => withCache(`search:${JSON.stringify(input)}`, () => dummyjsonSearch(input)),
});

export const getProduct = tool({
  description:
    "Get full details for ONE specific product by its numeric id, including stock, brand, warranty, " +
    "return policy, shipping info, and reviews. Use this for follow-up questions about a product the " +
    "user already saw in search results (e.g. 'does it have a warranty?', 'is it in stock?', 'what do " +
    "reviews say?'). Do NOT call searchProducts again just to answer a follow-up, the id is already known.",
  inputSchema: z.object({
    id: z.number().describe("The product id from a previous searchProducts result"),
  }),
  execute: async ({ id }) => withCache(`product:${id}`, () => dummyjsonGetProduct(id)),
});

export const listCategories = tool({
  description:
    "List all product category slugs this shop carries. Use this when the user asks what categories/types " +
    "of products are available, or when you're unsure of the exact category slug for a searchProducts call " +
    "(slugs are sometimes non-obvious, e.g. 'womens-jewellery' not 'jewelry', 'skin-care' not 'skincare').",
  inputSchema: z.object({}),
  execute: async () => withCache("categories", () => dummyjsonListCategories()),
});
