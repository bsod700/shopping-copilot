import type { ModelMessage } from "ai";

/**
 * One eval case = one or more user turns sent through streamText with the
 * real system prompt + tools, plus a programmatic check run against the
 * final result (no LLM judge, see BUILD_PLAN.md Section 9).
 */
export interface EvalCase {
  id: string;
  description: string;
  /** Each entry is one user turn. For multi-turn cases, provide more than one. */
  turns: string[];
  check: (ctx: EvalContext) => CheckResult;
}

export interface EvalContext {
  /** Final assistant text reply (last step). */
  text: string;
  /** All tool calls made across all turns/steps. */
  toolCalls: Array<{ toolName: string; input: unknown }>;
  /** All tool results made across all turns/steps. */
  toolResults: Array<{ toolName: string; output: unknown }>;
  /** Messages sent in the final request (for inspecting prior turns). */
  messages: ModelMessage[];
}

export type CheckResult = { pass: true } | { pass: false; reason: string };

function pass(): CheckResult {
  return { pass: true };
}

function fail(reason: string): CheckResult {
  return { pass: false, reason };
}

/** Extract every product the model could legitimately talk about from tool results. */
function groundedProducts(ctx: EvalContext): Array<{ id: number; title: string; price: number }> {
  const products: Array<{ id: number; title: string; price: number }> = [];
  for (const result of ctx.toolResults) {
    if (result.toolName !== "searchProducts" && result.toolName !== "getProduct") continue;
    const output = result.output as { products?: unknown[]; product?: unknown };
    const items = output.products ?? (output.product ? [output.product] : []);
    for (const item of items as Array<{ id: number; title: string; price: number }>) {
      if (item && typeof item.id === "number") products.push(item);
    }
  }
  return products;
}

export const evalCases: EvalCase[] = [
  {
    id: "normal-search",
    description: "Plain category search returns and discusses real products",
    turns: ["show me some smartphones"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const products = groundedProducts(ctx);
      if (products.length === 0) return fail("expected at least one product in tool results");
      return pass();
    },
  },

  {
    id: "ambiguous-cheap",
    description: "'Cheap' phrasing maps to price-ascending search",
    turns: ["show me something cheap in furniture"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const input = calls[0].input as { sortBy?: string; order?: string };
      if (input.sortBy !== "price" || input.order !== "asc") {
        return fail(`expected sortBy:price/order:asc, got ${JSON.stringify(input)}`);
      }
      if (!/price|budget|cheap|afford/i.test(ctx.text)) {
        return fail("reply doesn't mention price/budget framing");
      }
      return pass();
    },
  },

  {
    id: "off-catalog",
    description: "Off-catalog requests don't trigger a product search or invent a price",
    turns: ["can you book me a flight to Tokyo?"],
    check: (ctx) => {
      const searchCalls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (searchCalls.length > 0) return fail("searchProducts should not be called for off-catalog requests");
      if (/\$\d/.test(ctx.text)) return fail("reply should not invent a price for an off-catalog item");
      return pass();
    },
  },

  {
    id: "multi-intent",
    description: "Multi-intent request triggers a search per distinct ask",
    turns: ["show me some skin-care products and also a cheap pair of sunglasses"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length < 2) return fail(`expected at least 2 searchProducts calls, got ${calls.length}`);
      return pass();
    },
  },

  {
    id: "empty-result",
    description: "Nonsense query returns zero results and the model says so honestly",
    turns: ["show me products matching asdkjfhqwer123zzz"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const results = ctx.toolResults.filter((r) => r.toolName === "searchProducts");
      const hasEmpty = results.some((r) => {
        const output = r.output as { products?: unknown[] };
        return Array.isArray(output.products) && output.products.length === 0;
      });
      if (!hasEmpty) return fail("expected at least one searchProducts result with zero products");
      return pass();
    },
  },

  {
    id: "detail-followup",
    description: "Follow-up question about a prior result calls getProduct, not a new search",
    turns: ["show me smartphones", "tell me more about the first one, is it in stock?"],
    check: (ctx) => {
      const getProductCalls = ctx.toolCalls.filter((c) => c.toolName === "getProduct");
      if (getProductCalls.length === 0) return fail("expected getProduct to be called for the follow-up");
      if (!/stock/i.test(ctx.text)) return fail("reply doesn't mention stock status");
      return pass();
    },
  },

  {
    id: "category-list",
    description: "Asking about available categories calls listCategories and names real slugs",
    turns: ["what categories of products do you carry?"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "listCategories");
      if (calls.length === 0) return fail("expected listCategories to be called");
      const results = ctx.toolResults.find((r) => r.toolName === "listCategories");
      const categories = (results?.output as { categories?: string[] })?.categories ?? [];
      const mentioned = categories.filter((c) => ctx.text.toLowerCase().includes(c.toLowerCase()));
      if (mentioned.length < 3) {
        return fail(`expected at least 3 real category slugs mentioned, got ${mentioned.length}`);
      }
      return pass();
    },
  },

  {
    id: "budget-best-rated-single",
    description: "'Cheapest with best reviews' uses rankBy and returns only well-rated items",
    turns: ["show me the cheapest laptop with the best reviews"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const input = calls[0].input as { rankBy?: string };
      if (input.rankBy !== "budgetBestRated") {
        return fail(`expected rankBy: "budgetBestRated", got ${JSON.stringify(input)}`);
      }
      const products = groundedProducts(ctx) as Array<{ rating?: number }>;
      if (products.length === 0) return fail("expected at least one product in tool results");
      if (!products.every((p) => (p.rating ?? 0) >= 4)) {
        return fail("every returned product should have rating >= 4 for a 'best reviews' request");
      }
      return pass();
    },
  },

  {
    id: "budget-best-rated-dresses",
    description: "'Cheapest dress with good reviews' returns a real, well-rated, cheap dress",
    turns: ["show me the cheapest dress with good reviews"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const input = calls[0].input as { rankBy?: string };
      if (input.rankBy !== "budgetBestRated") {
        return fail(`expected rankBy: "budgetBestRated", got ${JSON.stringify(input)}`);
      }
      const products = groundedProducts(ctx) as Array<{ rating?: number; price?: number }>;
      if (products.length === 0) return fail("expected at least one product in tool results");
      if (!products.every((p) => (p.rating ?? 0) >= 4)) {
        return fail("every returned product should have rating >= 4");
      }
      return pass();
    },
  },

  {
    id: "category-synonym",
    description: "A word that maps to a known category (perfume -> fragrances) uses category, not query",
    turns: ["do you have any perfumes?"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const input = calls[0].input as { category?: string; query?: string };
      if (input.category !== "fragrances") {
        return fail(`expected category: "fragrances", got ${JSON.stringify(input)}`);
      }
      const products = groundedProducts(ctx);
      if (products.length === 0) return fail("expected at least one product in tool results");
      return pass();
    },
  },

  {
    id: "groundedness-prices",
    description: "Every price mentioned in the reply matches a price from tool results",
    turns: ["show me some women's bags"],
    check: (ctx) => {
      const products = groundedProducts(ctx);
      if (products.length === 0) return fail("expected at least one product in tool results");
      const knownPrices = new Set(products.map((p) => p.price.toFixed(2)));
      const mentionedPrices = [...ctx.text.matchAll(/\$(\d+(?:\.\d{1,2})?)/g)].map((m) =>
        Number(m[1]).toFixed(2),
      );
      const hallucinated = mentionedPrices.filter((p) => !knownPrices.has(p));
      if (hallucinated.length > 0) {
        return fail(`reply mentions price(s) not in tool results: ${hallucinated.join(", ")}`);
      }
      return pass();
    },
  },

  {
    id: "follow-up-suggestions",
    description: "Final reply includes follow-up suggestions",
    turns: ["show me some sports accessories"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "suggestFollowUps");
      if (calls.length === 0) return fail("expected suggestFollowUps to be called");
      const input = calls[0].input as { suggestions?: string[] };
      if (!input.suggestions || input.suggestions.length < 2) {
        return fail("expected at least 2 follow-up suggestions");
      }
      return pass();
    },
  },
];
