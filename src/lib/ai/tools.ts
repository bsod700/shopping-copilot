/**
 * @fileoverview AI tool definitions for the shopping assistant.
 *
 * All tools are built with Vercel AI SDK's `tool()` helper and registered in
 * `app/api/chat/route.ts`. Two tools carry `needsApproval: true` which causes the
 * AI SDK to pause the stream and emit an approval request to the client before
 * the tool's `execute` function runs — the user sees an approve/deny dialog in the UI.
 *
 * Two cross-cutting concerns are implemented here at the framework level so the
 * model doesn't need to be prompted into them:
 *
 * 1. **In-memory result cache** (`withCache`) — keyed by serialized input, 5-min TTL.
 *    Repeated or retried calls with identical params return instantly without hitting
 *    the DummyJSON API again. Scoped to the process lifetime (not per-conversation).
 *
 * 2. **Per-conversation shown-IDs tracking** (`shownIdsByConversation`) — records
 *    which product ids the assistant has already returned for each category/query key
 *    within a conversation. On "show more" follow-ups, `createSearchProductsTool`
 *    detects when all results were already shown and fetches a broader pool to surface
 *    fresh products instead of repeating the same handful.
 */
import { tool } from "ai";
import { z } from "zod";
import {
  searchProducts as dummyjsonSearch,
  getProduct as dummyjsonGetProduct,
  listCategories as dummyjsonListCategories,
  type SearchProductsInput,
  type SearchProductsResult,
} from "@/lib/dummyjson";
import type { Product } from "@/lib/types";
import type { ChatUIMessage } from "@/lib/ai/uiMessage"; // used by extractLastProducts

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

/**
 * Factory that creates a `searchProducts` tool instance bound to a specific conversation.
 *
 * The factory pattern is required because the tool needs to close over `conversationId`
 * to read/write the per-conversation shown-IDs map. A module-level singleton tool cannot
 * do this — each POST request calls the factory with the conversation's id.
 *
 * The tool enforces one hard invariant at the framework level (not just in the system
 * prompt): when `limit === 20` (the "show all" sentinel), all narrowing filters are
 * stripped unconditionally so the model can't accidentally zero out results on a
 * full-catalog browse.
 */
export function createSearchProductsTool(conversationId: string) {
  return tool({
    description:
      "Search the product catalog. Choose params based on the user's intent:\n\n" +
      "INTENT → PARAMS TO SET:\n" +
      "• 'show all X' / 'list all X' → category (or query), limit:20, nothing else\n" +
      "• 'cheapest X' / 'lowest price' → sortBy:'price', order:'asc', limit:1  [reply MUST say 'cheapest' or 'lowest price']\n" +
      "• 'cheap options' / 'budget X' / 'something cheap' → sortBy:'price', order:'asc', limit:3  [reply MUST say 'cheap', 'budget', 'affordable', or 'price']\n" +
      "• 'best rated' / 'top rated' / 'highest rated' → use getBestRated tool instead, NOT searchProducts\n" +
      "• 'best value' / 'cheapest good X' / price+quality → rankBy:'budgetBestRated'\n" +
      "• 'in stock only' / 'available' → inStock:true\n" +
      "• 'good quality' / 'well reviewed' / 'rating above N' → minRating:4 (or N)\n" +
      "• 'show me some X' / 'show me X' / 'what X do you have' / 'do you have X' / 'any X' → category, limit:5, NOTHING ELSE\n\n" +
      "HARD RULES:\n" +
      "• Never set both query AND category — category wins, query is silently ignored by the API\n" +
      "• 'show all' / 'show me all' / 'list all' means limit:20 and NOTHING ELSE — no rankBy, no minRating, no inStock, no sortBy. Zero filters.\n" +
      "• Only call for physical retail products. Not for services, travel, or digital goods.",
    inputSchema: z.object({
      query: z.string().optional().describe("Free-text keyword search — only for terms that don't map to a whole category"),
      category: z.string().optional().describe("Exact category slug, e.g. 'smartphones', 'womens-dresses'"),
      sortBy: z.enum(["price", "rating", "title", "discountPercentage"]).optional().describe("Sort field — omit when using rankBy. Use 'discountPercentage' for sale/discount queries."),
      order: z.enum(["asc", "desc"]).optional().describe("Sort direction — omit when using rankBy"),
      rankBy: z
        .enum(["budgetBestRated", "biggestDiscount", "discountedBestRated"])
        .optional()
        .describe("'budgetBestRated': filters to well-rated products (rating >= 4) then sorts cheapest first. Use for price+quality requests. 'biggestDiscount': keeps only discounted products, sorts by highest discount first. Use for sale/discount queries. 'discountedBestRated': keeps only discounted products, sorts by highest rating first. Use when user wants best-rated items that are on sale. Overrides sortBy/order."),
      limit: z.number().min(1).max(20).default(5).describe("Max results. Use 20 for 'show all', 1 for single cheapest/best, 3-5 for browsing"),
      minRating: z.number().min(1).max(5).optional().describe("Only return products with rating >= this value, e.g. 4 for 'good quality'"),
      inStock: z.boolean().optional().describe("If true, exclude out-of-stock products"),
      filterByTags: z.array(z.string()).optional().describe("Keep only products whose tags include at least one of these values. Use for sub-category filtering within a loose category (e.g. filterByTags:[\"desserts\",\"beverages\",\"condiments\"] for snacks within groceries)"),
      outOfStock: z.boolean().optional().describe("If true, return ONLY out-of-stock products. Use when the user asks for items that are out of stock or unavailable. Cannot be combined with inStock:true."),
      colorFilter: z.string().optional().describe("Filter results to products where this COLOR word appears in the title OR description. ONLY use for actual color words: red, blue, green, black, white, pink, yellow, purple, orange, gold, silver, etc. Do NOT use for finish types, materials, styles, or any non-color descriptors."),
    }),
    execute: async (rawInput) => {
      if (process.env.NODE_ENV !== "test") console.log("[searchProducts]", JSON.stringify(rawInput));
      // Framework-level enforcement: "show all" requests (limit=20) must never
      // have filters that can zero out results — strip them unconditionally.
      const input =
        rawInput.limit === 20
          ? { ...rawInput, rankBy: undefined, minRating: undefined, inStock: undefined, sortBy: undefined, order: undefined }
          : rawInput.query && rawInput.category && !rawInput.filterByTags?.length
          ? { ...rawInput, query: undefined }
          : rawInput.outOfStock
          ? { ...rawInput, inStock: undefined, rankBy: undefined, minRating: undefined, sortBy: undefined, order: undefined }
          : rawInput.filterByTags?.length
          ? { ...rawInput, query: rawInput.category ? undefined : rawInput.query, rankBy: undefined, minRating: undefined }
          : rawInput.query && !rawInput.category && rawInput.rankBy
          ? { ...rawInput, rankBy: undefined }
          : rawInput;

      let shownIdsByKey = shownIdsByConversation.get(conversationId);
      if (!shownIdsByKey) {
        shownIdsByKey = new Map();
        shownIdsByConversation.set(conversationId, shownIdsByKey);
      }
      const key = shownKey(input);
      const seen = shownIdsByKey.get(key);

      let result = await withCache(`search:${JSON.stringify(input)}`, () => dummyjsonSearch(input));

      // If budgetBestRated returned 0 results, or returned only out-of-stock products
      // (rating ≥ 4 filter is too aggressive / all qualifying products are OOS),
      // retry without rankBy/minRating/inStock so the user sees actual options.
      const allOos = result.products.length > 0 && result.products.every((p) => p.availabilityStatus === "Out of Stock");
      const tooFew = result.products.length < 3 && (input.limit ?? 5) > 1;
      if (input.rankBy === "budgetBestRated" && (result.products.length === 0 || allOos || tooFew) && input.category) {
        const fallbackInput: SearchProductsInput = { ...input, rankBy: undefined, minRating: undefined, inStock: undefined };
        const fallback = await withCache(`search:${JSON.stringify(fallbackInput)}`, () => dummyjsonSearch(fallbackInput));
        if (fallback.products.length > result.products.length) {
          result = fallback;
        }
      }

      // If this returned nothing, or everything it returned was already shown,
      // re-fetch a broader pool (no rankBy/query narrowing) and filter out seen ids.
      // Skip this for explicit sort/rank requests — the user wants the same products
      // in a different order, not "fresh" ones they haven't seen yet.
      const isSortOrRank = Boolean(input.sortBy || input.order || input.rankBy);
      const allRepeats =
        !isSortOrRank &&
        seen && seen.size > 0 && result.products.length > 0 && result.products.every((p) => seen.has(p.id));
      if (input.category && (result.products.length === 0 || allRepeats)) {
        const broaderInput: SearchProductsInput = {
          ...input,
          query: undefined,
          rankBy: undefined,
          limit: 20,
        };
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

/**
 * Fetch products from a category filtered to rating >= minRating, sorted best first.
 * Dedicated tool so the model never confuses "best rated" with "best value" (budgetBestRated).
 */
export const getBestRated = tool({
  description:
    "Show only the best-rated products in a category — filters to those with rating >= minRating (default 4) " +
    "and sorts highest rating first. Use when the user asks for 'best rated', 'top rated', 'highest rated', " +
    "'well reviewed', or 'good quality' products. Do NOT use searchProducts for these requests.",
  inputSchema: z.object({
    category: z.string().describe("Exact category slug, e.g. 'laptops', 'womens-dresses'"),
    minRating: z.number().min(1).max(5).default(4).describe("Minimum rating threshold (default 4)"),
    limit: z.number().min(1).max(20).default(5),
  }),
  execute: async ({ category, minRating, limit }) => {
    const result = await withCache(
      `bestrated:${category}:${minRating}:${limit}`,
      () => dummyjsonSearch({ category, minRating, sortBy: "rating", order: "desc", limit: 20 }),
    );
    const filtered = result.products.filter((p) => p.rating >= minRating);
    filtered.sort((a, b) => b.rating - a.rating);
    return { products: filtered.slice(0, limit) };
  },
});

/**
 * Fetch full details for one product by numeric id.
 *
 * Used for follow-up questions about a product already shown in search results
 * ("is it in stock?", "what's the warranty?", "any reviews?"). Results are
 * cached for 5 minutes so repeated follow-ups on the same product are free.
 */
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

/**
 * Extract the last searchProducts result from the incoming message list.
 *
 * Called in route.ts before streamText. The client sends the full message
 * history on every request, so this always works — no server state needed.
 */
export function extractLastProducts(messages: ChatUIMessage[]): Product[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j];
      if (part.type === "tool-searchProducts" && part.state === "output-available") {
        return part.output.products;
      }
    }
  }
  return [];
}

/**
 * Factory that creates a `sortShownProducts` tool.
 *
 * Receives the already-extracted last product list so there is no server-side
 * state — works correctly in serverless / multi-instance environments.
 */
export function createSortShownProductsTool(lastProducts: Product[]) {
  return tool({
    description:
      "Re-sort the products the user is currently looking at, WITHOUT fetching new ones from the catalog. " +
      "ONLY use this for broad/full-catalog searches that had NO category and NO query (Case 2 re-sort). " +
      "Do NOT use this for category or query searches — for those, call searchProducts again with the new sortBy/order instead. " +
      "Just specify sortBy and order; the server uses the last search result automatically.",
    inputSchema: z.object({
      sortBy: z.enum(["price", "rating", "discountPercentage"]).describe("Field to sort by"),
      order: z.enum(["asc", "desc"]).describe("Sort direction"),
    }),
    execute: async ({ sortBy, order }) => {
      const dir = order === "asc" ? 1 : -1;
      const sorted = [...lastProducts].sort((a, b) => (a[sortBy] - b[sortBy]) * dir);
      return { products: sorted };
    },
  });
}

/**
 * Emit 2-4 follow-up suggestion chips after the model's final text reply.
 *
 * The model is instructed to call this last in every turn so the UI can render
 * tappable chips below the message. The `execute` function just echoes the
 * suggestions back so they appear as a tool-result part — `MessageBubble` reads
 * that part and renders the chips outside the main message bubble.
 */
export const suggestFollowUps = tool({
  description:
    "MANDATORY: Call this as your VERY LAST action on EVERY turn where any product tool ran " +
    "(searchProducts, getBestRated, getProduct, or sortShownProducts). No exceptions — even if results were few. " +
    "Offer 2-4 short follow-up actions phrased as things the USER would say (first person / " +
    "imperative), e.g. 'Sort by lowest price' or 'Show details for Chanel Coco Noir'. " +
    "IMPORTANT: Do NOT include any 'Sort by...' suggestion if only 1 product was shown — " +
    "sorting a single result is meaningless. Count the products first.",
  inputSchema: z.object({
    suggestions: z.array(z.string()).min(2).max(4),
  }),
  execute: async ({ suggestions }) => ({ suggestions }),
});

/**
 * Add a product to the cart with human-in-the-loop approval.
 *
 * `needsApproval: true` causes the AI SDK to pause the stream and emit an
 * approval request to the client. The user sees a confirm/deny dialog rendered
 * by `ChatWindow` before `execute` runs. On deny, the tool result is skipped
 * and the model receives a denial signal.
 */
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

/**
 * Place a demo order for the current cart contents, with human-in-the-loop approval.
 *
 * Like `addToCart`, `needsApproval: true` gates this behind a UI confirmation.
 * No real payment is processed — `execute` generates a random demo order id for
 * display purposes only.
 */
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

/**
 * List all available product category slugs.
 *
 * Used by the model when it's unsure of the exact slug for a user's request
 * (e.g. "womens-jewellery" not "jewelry"). Results are cached for 5 minutes;
 * DummyJSON's category list is static demo data and never changes at runtime.
 */
export const listCategories = tool({
  description:
    "List all product category slugs this shop carries. Use this when the user asks what categories/types " +
    "of products are available, or when you're unsure of the exact category slug for a searchProducts call " +
    "(slugs are sometimes non-obvious, e.g. 'womens-jewellery' not 'jewelry', 'skin-care' not 'skincare').",
  inputSchema: z.object({}),
  execute: async () => withCache("categories", () => dummyjsonListCategories()),
});
