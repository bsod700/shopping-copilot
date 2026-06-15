import { tool } from "ai";
import { z } from "zod";
import {
  searchProducts as dummyjsonSearch,
  getProduct as dummyjsonGetProduct,
  listCategories as dummyjsonListCategories,
  type SearchProductsInput,
  type SearchProductsResult,
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

// Tracks product ids already returned for a given category/query within each
// conversation, so a "show more" follow-up that would otherwise re-run with
// the same params (and the same rankBy/limit narrowing) gets broadened to
// surface fresh products instead of repeating the same handful, regardless of
// category. Keyed by conversationId so unrelated conversations don't leak
// "already shown" state into each other.
const shownIdsByConversation = new Map<string, Map<string, Set<number>>>();

function shownKey(input: SearchProductsInput): string {
  return input.category ?? input.query ?? "__all__";
}

export function createSearchProductsTool(conversationId: string) {
  return tool({
    description:
      "Search the product catalog. Use `query` for keyword search, `category` when the user names a category " +
      "(e.g. smartphones, skincare, furniture). Use sortBy/order='price'/'asc' and limit: 1 for 'cheapest' " +
      "or 'lowest price' requests, unless the user asks for multiple options; use limit: 3 for cheap/budget options. " +
      "When the user combines price AND quality (e.g. 'cheapest with good/best reviews', 'best value', " +
      "'good rating but affordable'), set rankBy: 'budgetBestRated' instead of sortBy/order: this filters out " +
      "poorly-rated products first, then ranks the rest by price so every result is both well-reviewed and as " +
      "cheap as possible. Only call this for physical retail products this shop might carry. Do not call it for " +
      "services, travel, digital goods, or anything clearly outside a product catalog.",
    inputSchema: z.object({
      query: z.string().optional().describe("Free-text search keywords"),
      category: z.string().optional().describe("Exact category slug, e.g. 'smartphones'"),
      sortBy: z.enum(["price", "rating", "title"]).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      rankBy: z
        .enum(["budgetBestRated"])
        .optional()
        .describe(
          "Use 'budgetBestRated' for combined price+quality requests: filters to well-rated products " +
            "(rating >= 4) then sorts by price ascending. Overrides sortBy/order when set.",
        ),
      limit: z.number().min(1).max(10).default(5),
    }),
    execute: async (input) => {
      let shownIdsByKey = shownIdsByConversation.get(conversationId);
      if (!shownIdsByKey) {
        shownIdsByKey = new Map();
        shownIdsByConversation.set(conversationId, shownIdsByKey);
      }
      const key = shownKey(input);
      const seen = shownIdsByKey.get(key);

      let result = await withCache(`search:${JSON.stringify(input)}`, () => dummyjsonSearch(input));

      // If this returned nothing, or everything it returned was already shown
      // earlier in this conversation, re-fetch a broader pool (no rankBy
      // narrowing, no query restriction beyond category, more results) and
      // filter out the ids the user has already seen.
      const allRepeats =
        seen && seen.size > 0 && result.products.length > 0 && result.products.every((p) => seen.has(p.id));
      if (input.category && (result.products.length === 0 || allRepeats)) {
        const broaderInput: SearchProductsInput = { ...input, query: undefined, rankBy: undefined, limit: 20 };
        const broader = await withCache(`search:broad:${JSON.stringify(broaderInput)}`, () =>
          dummyjsonSearch(broaderInput),
        );
        const fresh = seen ? broader.products.filter((p) => !seen.has(p.id)) : broader.products;
        if (fresh.length > 0) {
          result = { ...broader, products: fresh.slice(0, input.limit ?? 5) } satisfies SearchProductsResult;
        }
      }

      let ids = shownIdsByKey.get(key);
      if (!ids) {
        ids = new Set();
        shownIdsByKey.set(key, ids);
      }
      for (const p of result.products) ids.add(p.id);

      return result;
    },
  });
}

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

export const suggestFollowUps = tool({
  description:
    "Call this LAST, after your text reply, to offer the user 2-4 short follow-up actions they can " +
    "tap instead of typing. Phrase each suggestion as something the USER would say (first person / " +
    "imperative), e.g. 'Sort by lowest price' or 'Show details for Chanel Coco Noir'.",
  inputSchema: z.object({
    suggestions: z.array(z.string()).min(2).max(4),
  }),
  execute: async ({ suggestions }) => ({ suggestions }),
});

export const addToCart = tool({
  description:
    "Add a product to the user's cart. Only call this after the user has clearly asked to add/buy a " +
    "specific product they've already seen (from searchProducts or getProduct). The user will be shown " +
    "an approve/deny confirmation before it's added, so you don't need to ask for confirmation yourself " +
    "in your text reply, just call the tool.",
  inputSchema: z.object({
    productId: z.number().describe("The product id"),
    title: z.string().describe("The product title, for display in the confirmation"),
    price: z.number().describe("The product price, for display in the confirmation"),
    quantity: z.number().min(1).max(10).default(1),
  }),
  needsApproval: true,
  execute: async (input) => ({ added: true, ...input }),
});

export const checkout = tool({
  description:
    "Place a demo order for everything currently in the user's cart. Only call this when the user " +
    "explicitly asks to checkout/buy/place the order. The user will be shown an approve/deny confirmation " +
    "first. This is a demo, it does not charge any real payment.",
  inputSchema: z.object({}),
  needsApproval: true,
  execute: async () => ({
    orderId: `DEMO-${Math.floor(100000 + Math.random() * 900000)}`,
    placedAt: new Date().toISOString(),
  }),
});

export const listCategories = tool({
  description:
    "List all product category slugs this shop carries. Use this when the user asks what categories/types " +
    "of products are available, or when you're unsure of the exact category slug for a searchProducts call " +
    "(slugs are sometimes non-obvious, e.g. 'womens-jewellery' not 'jewelry', 'skin-care' not 'skincare').",
  inputSchema: z.object({}),
  execute: async () => withCache("categories", () => dummyjsonListCategories()),
});
