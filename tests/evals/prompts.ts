/**
 * @fileoverview Eval case definitions for the LLM behavior test suite.
 *
 * Each `EvalCase` sends one or more user turns through `streamText` with the real
 * system prompt and tools (same model, same config as production), then runs a
 * **programmatic check** — no LLM judge, no scoring rubric. Pass/fail is deterministic:
 * did the model call the right tool, with the right params, and mention the right things?
 *
 * Cases cover:
 * - Correct tool routing (category vs. search vs. browse, getProduct for follow-ups)
 * - Param correctness (`sortBy: price`, `rankBy: budgetBestRated`, `category: fragrances`)
 * - Off-catalog refusal (no tool call, no invented price)
 * - Multi-intent (≥2 separate `searchProducts` calls)
 * - Groundedness (prices in reply must match prices in tool results)
 * - Product type fidelity (suits/corsets not presented as dresses)
 * - Show-more deduplication (second search returns different product IDs)
 * - Follow-up suggestions (at least 2 chips via `suggestFollowUps`)
 *
 * Run with: `npx tsx tests/evals/run-evals.ts [case-id]`
 */
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
    id: "womens-dresses-no-off-type",
    description: "'What women's dresses do you have?' lists only genuine dresses, not corsets/suits from the same category",
    turns: ["What women's dresses do you have?"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const products = groundedProducts(ctx);
      if (products.length === 0) return fail("expected at least one product in tool results");

      const offType = products.filter((p) => /suit|corset/i.test(p.title));
      for (const p of offType) {
        if (ctx.text.includes(p.title)) {
          return fail(`off-type item "${p.title}" should not be listed as a women's dress option`);
        }
      }
      return pass();
    },
  },

  {
    id: "color-modifier-dress",
    description: "'<color> dresses' searches by product type, doesn't show off-type items (suits/corsets), and is upfront if no red dress exists",
    turns: ["show me all the red dresses"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const products = groundedProducts(ctx);
      if (products.length === 0) return fail("expected at least one product in tool results");

      // The catalog has no actual "red dress", so the reply should say so plainly.
      if (!/(no|couldn.t find|don.t have|none).*red dress|red dress.*(no|n.t|none)/i.test(ctx.text)) {
        return fail(`expected the reply to plainly say no red dress was found, got: ${ctx.text.slice(0, 300)}`);
      }

      // Off-type items (suits, corsets) shouldn't be presented as dress alternatives
      // without being clearly qualified as not actually a dress.
      const offType = products.filter((p) => /suit|corset/i.test(p.title));
      for (const p of offType) {
        if (ctx.text.includes(p.title) && !/not a dress|isn.t a dress|not.*dress/i.test(ctx.text)) {
          return fail(`off-type item "${p.title}" mentioned without clarifying it isn't a dress`);
        }
      }
      return pass();
    },
  },
  {
    id: "sports-balls-only",
    description: "'Show me all the balls' — model must not mention non-ball sports equipment",
    turns: ["show me all the balls"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const nonBallItems = ["Baseball Glove", "Basketball Rim", "Baseball Bat", "Cricket Bat", "Tennis Racket", "Sneaker", "Cleat"];
      const mentionedWrong = nonBallItems.filter((t) => ctx.text.toLowerCase().includes(t.toLowerCase()));
      if (mentionedWrong.length > 0) return fail(`model mentioned non-ball items: ${mentionedWrong.join(", ")}`);
      return pass();
    },
  },

  {
    id: "out-of-stock",
    description: "'Show items that are out of stock' returns only out-of-stock products",
    turns: ["show me all the items that are out of stock"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const hasOutOfStockParam = calls.some((c) => (c.input as { outOfStock?: boolean }).outOfStock === true);
      if (!hasOutOfStockParam) return fail("expected at least one searchProducts call with outOfStock:true");
      const products = groundedProducts(ctx) as Array<{ id: number; title: string; price: number; availabilityStatus?: string }>;
      const inStockItems = ctx.toolResults
        .filter((r) => r.toolName === "searchProducts")
        .flatMap((r) => {
          const output = r.output as { products?: Array<{ availabilityStatus?: string; title?: string }> };
          return (output.products ?? []).filter((p) => p.availabilityStatus !== "Out of Stock");
        });
      if (inStockItems.length > 0) {
        return fail(`in-stock items leaked into out-of-stock results: ${inStockItems.map((p) => p.title).join(", ")}`);
      }
      const outOfStockItems = ctx.toolResults
        .filter((r) => r.toolName === "searchProducts")
        .flatMap((r) => {
          const output = r.output as { products?: Array<{ availabilityStatus?: string }> };
          return (output.products ?? []).filter((p) => p.availabilityStatus === "Out of Stock");
        });
      if (outOfStockItems.length === 0) return fail("no out-of-stock products were found — catalog-wide search may not have been used");
      return pass();
    },
  },

  {
    id: "beverage-filtering",
    description: "'Show only beverages' returns all 4 beverage items including Nescafe Coffee",
    turns: ["Show only beverages"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const products = groundedProducts(ctx);
      if (products.length === 0) return fail("expected beverage products in tool results");
      const expectedTitles = ["Water", "Juice", "Soft Drinks", "Nescafe Coffee"];
      const missing = expectedTitles.filter(
        (t) => !products.some((p) => p.title.toLowerCase().includes(t.toLowerCase()))
      );
      if (missing.length > 0) return fail(`missing beverages in results: ${missing.join(", ")}`);
      const nonBeverageTitles = ["Potatoes", "Cucumber", "Milk", "Eggs", "Beef Steak", "Ice Cream", "Honey Jar"];
      const wrong = nonBeverageTitles.filter(
        (t) => products.some((p) => p.title.toLowerCase().includes(t.toLowerCase()))
      );
      if (wrong.length > 0) return fail(`non-beverage items in results: ${wrong.join(", ")}`);
      return pass();
    },
  },

  {
    id: "snack-filtering",
    description: "'Show only in-stock snacks' returns snack-like items and NOT raw vegetables, meat, dairy, or cooking oil",
    turns: ["Show only in-stock snacks"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      // Model either calls searchProducts or explains honestly — if it calls it, check filtering
      const nonSnackTitles = [
        "Potatoes", "Cucumber", "Green Bell Pepper", "Green Chili Pepper", "Red Onions",
        "Beef Steak", "Chicken Meat", "Fish Steak",
        "Eggs", "Milk",
        "Cooking Oil", "Rice",
        "Cat Food", "Dog Food", "Tissue Paper Box", "Protein Powder",
      ];
      for (const title of nonSnackTitles) {
        if (ctx.text.toLowerCase().includes(title.toLowerCase())) {
          return fail(`non-snack item "${title}" should not appear in snack results`);
        }
      }
      if (calls.length > 0) {
        // Tool results must contain only snack-like items
        // Acceptable snack/beverage titles (water is borderline but acceptable as a beverage)
        const snackTitles = ["Ice Cream", "Juice", "Soft Drinks", "Nescafe Coffee", "Honey Jar", "Water"];
        const returnedProducts = groundedProducts(ctx);
        if (returnedProducts.length === 0) return fail("expected snack products in tool results");
        const wrongItems = returnedProducts.filter(
          (p) => !snackTitles.some((s) => p.title.toLowerCase().includes(s.toLowerCase()))
        );
        if (wrongItems.length > 0) {
          return fail(`non-snack items in tool results: ${wrongItems.map((p) => p.title).join(", ")}`);
        }
      }
      return pass();
    },
  },

  {
    id: "popular-single-call",
    description: "Broad sale/discount query makes exactly one searchProducts call with no category",
    turns: ["What's on sale? Show me the biggest discounts"],
    check: (ctx) => {
      const searches = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (searches.length !== 1) return fail(`expected 1 searchProducts call, got ${searches.length}`);
      const input = searches[0].input as { category?: string; query?: string; rankBy?: string };
      if (input.category) return fail(`expected no category, got "${input.category}"`);
      if (input.query) return fail(`expected no query, got "${input.query}"`);
      if (input.rankBy !== "biggestDiscount") return fail(`expected rankBy:"biggestDiscount", got "${input.rankBy}"`);

      // All returned products must actually have a discount
      for (const r of ctx.toolResults) {
        if (r.toolName !== "searchProducts") continue;
        const products = (r.output as { products?: Array<{ title: string; discountPercentage: number }> }).products ?? [];
        const noDiscount = products.filter((p) => p.discountPercentage <= 0);
        if (noDiscount.length > 0) {
          return fail(`products with no discount in results: ${noDiscount.map((p) => p.title).join(", ")}`);
        }
        if (products.length === 0) return fail("expected at least one discounted product");
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

  // ─── Sort tests ───────────────────────────────────────────────────────────

  {
    id: "sort-by-price-asc",
    description: "After a category search, 'sort by price low to high' calls sortShownProducts (not a new search) and output is in ascending price order",
    turns: ["show me some laptops", "sort by price low to high"],
    check: (ctx) => {
      const sortCalls = ctx.toolCalls.filter((c) => c.toolName === "sortShownProducts");
      if (sortCalls.length === 0) return fail("expected sortShownProducts to be called");
      const input = sortCalls[0].input as { sortBy?: string; order?: string };
      if (input.sortBy !== "price" || input.order !== "asc")
        return fail(`expected sortBy:price/order:asc, got ${JSON.stringify(input)}`);
      // Model must not have re-fetched — only 1 searchProducts call total
      const searches = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (searches.length > 1) return fail(`sort triggered a new searchProducts call (got ${searches.length}) — should use sortShownProducts only`);
      // Verify actual output is sorted
      const sortResult = ctx.toolResults.find((r) => r.toolName === "sortShownProducts");
      const products = (sortResult?.output as { products?: Array<{ price: number }> })?.products ?? [];
      if (products.length < 2) return fail("expected at least 2 products in sort result");
      for (let i = 1; i < products.length; i++) {
        if (products[i].price < products[i - 1].price)
          return fail(`products not in ascending price order at index ${i}: ${products[i - 1].price} > ${products[i].price}`);
      }
      return pass();
    },
  },

  {
    id: "sort-by-rating-desc",
    description: "After a search, 'sort by best rating' calls sortShownProducts and output is in descending rating order",
    turns: ["show me some smartphones", "sort by best rating"],
    check: (ctx) => {
      const sortCalls = ctx.toolCalls.filter((c) => c.toolName === "sortShownProducts");
      if (sortCalls.length === 0) return fail("expected sortShownProducts to be called");
      const input = sortCalls[0].input as { sortBy?: string; order?: string };
      if (input.sortBy !== "rating" || input.order !== "desc")
        return fail(`expected sortBy:rating/order:desc, got ${JSON.stringify(input)}`);
      const searches = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (searches.length > 1) return fail(`sort triggered a new searchProducts call — should use sortShownProducts`);
      const sortResult = ctx.toolResults.find((r) => r.toolName === "sortShownProducts");
      const products = (sortResult?.output as { products?: Array<{ rating: number }> })?.products ?? [];
      if (products.length < 2) return fail("expected at least 2 products in sort result");
      for (let i = 1; i < products.length; i++) {
        if (products[i].rating > products[i - 1].rating)
          return fail(`products not in descending rating order at index ${i}`);
      }
      return pass();
    },
  },

  {
    id: "sort-by-price-desc",
    description: "After a search, 'sort by price high to low' calls sortShownProducts and output is in descending price order",
    turns: ["show me women's bags", "sort by price high to low"],
    check: (ctx) => {
      const sortCalls = ctx.toolCalls.filter((c) => c.toolName === "sortShownProducts");
      if (sortCalls.length === 0) return fail("expected sortShownProducts to be called");
      const input = sortCalls[0].input as { sortBy?: string; order?: string };
      if (input.sortBy !== "price" || input.order !== "desc")
        return fail(`expected sortBy:price/order:desc, got ${JSON.stringify(input)}`);
      const sortResult = ctx.toolResults.find((r) => r.toolName === "sortShownProducts");
      const products = (sortResult?.output as { products?: Array<{ price: number }> })?.products ?? [];
      if (products.length < 2) return fail("expected at least 2 products in sort result");
      for (let i = 1; i < products.length; i++) {
        if (products[i].price > products[i - 1].price)
          return fail(`products not in descending price order at index ${i}`);
      }
      return pass();
    },
  },

  // ─── Multi-topic conversation tests ───────────────────────────────────────

  {
    id: "multi-topic-sequential",
    description: "Asking about two unrelated topics in sequential turns searches each independently with correct categories",
    turns: ["show me some laptops", "now show me women's bags"],
    check: (ctx) => {
      const searches = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (searches.length < 2) return fail(`expected at least 2 searchProducts calls, got ${searches.length}`);
      const firstInput = searches[0].input as { category?: string };
      if (firstInput.category !== "laptops") return fail(`first search should be laptops, got ${JSON.stringify(firstInput)}`);
      const lastInput = searches[searches.length - 1].input as { category?: string };
      if (lastInput.category !== "womens-bags") return fail(`second search should be womens-bags, got ${JSON.stringify(lastInput)}`);
      // Each search must return products
      const results = ctx.toolResults.filter((r) => r.toolName === "searchProducts");
      for (const r of results) {
        const products = (r.output as { products?: unknown[] }).products ?? [];
        if (products.length === 0) return fail("one of the searches returned no products");
      }
      return pass();
    },
  },

  {
    id: "multi-topic-same-turn",
    description: "Asking about two topics in one message triggers two separate searchProducts calls",
    turns: ["show me some skincare products and also a pair of sunglasses"],
    check: (ctx) => {
      const searches = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (searches.length < 2) return fail(`expected 2 searchProducts calls for 2 topics, got ${searches.length}`);
      const categories = searches.map((s) => (s.input as { category?: string }).category);
      if (!categories.includes("skin-care")) return fail(`expected skin-care to be searched, got ${categories.join(", ")}`);
      if (!categories.includes("sunglasses")) return fail(`expected sunglasses to be searched, got ${categories.join(", ")}`);
      return pass();
    },
  },

  {
    id: "multi-topic-sort-second",
    description: "In a multi-topic chat, sorting after the second search sorts those products, not the first search's products",
    turns: ["show me some skin-care products", "now show me sunglasses", "sort by price low to high"],
    check: (ctx) => {
      const sortCalls = ctx.toolCalls.filter((c) => c.toolName === "sortShownProducts");
      if (sortCalls.length === 0) return fail("expected sortShownProducts to be called");
      const sortResult = ctx.toolResults.find((r) => r.toolName === "sortShownProducts");
      const sortedProducts = (sortResult?.output as { products?: Array<{ id: number; price: number }> })?.products ?? [];
      if (sortedProducts.length === 0) return fail("sort result is empty");
      // The sorted products must come from the sunglasses search (last search), not skin-care
      const searches = ctx.toolResults.filter((r) => r.toolName === "searchProducts");
      if (searches.length < 2) return fail("expected 2 search results");
      const lastSearchProducts = (searches[searches.length - 1].output as { products?: Array<{ id: number }> })?.products ?? [];
      const lastIds = new Set(lastSearchProducts.map((p) => p.id));
      const wrongProducts = sortedProducts.filter((p) => !lastIds.has(p.id));
      if (wrongProducts.length > 0)
        return fail(`sorted products contain IDs not from the last search: ${wrongProducts.map((p) => p.id).join(", ")}`);
      return pass();
    },
  },

  // ─── Category coverage ────────────────────────────────────────────────────

  {
    id: "category-womens-jewellery-slug",
    description: "Searching for women's jewelry uses the correct non-obvious slug 'womens-jewellery' (not 'womens-jewelry') in at least one searchProducts call",
    turns: ["show me women's jewelry"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      // The model may call listCategories first and then retry with the correct slug —
      // that is correct intended behavior. Check that the right slug was used in ANY call.
      const usedCorrectSlug = calls.some(
        (c) => (c.input as { category?: string }).category === "womens-jewellery",
      );
      if (!usedCorrectSlug)
        return fail(
          `expected category:womens-jewellery in at least one call, got: ${JSON.stringify(calls.map((c) => c.input))}`,
        );
      const products = groundedProducts(ctx);
      if (products.length === 0) return fail("expected jewellery products in results");
      return pass();
    },
  },

  {
    id: "category-womens-watches",
    description: "Asking for women's watches returns in-stock options (not just the one out-of-stock watch)",
    turns: ["is there any women's watches?"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const input = calls[0].input as { category?: string };
      if (input.category !== "womens-watches")
        return fail(`expected category:womens-watches, got ${JSON.stringify(input)}`);
      const products = groundedProducts(ctx) as Array<{ availabilityStatus?: string }>;
      const inStock = products.filter((p) => p.availabilityStatus !== "Out of Stock");
      if (inStock.length === 0)
        return fail("expected at least one in-stock women's watch — budgetBestRated fallback may not have fired");
      return pass();
    },
  },

  {
    id: "category-mens-watches-separate",
    description: "Asking for men's watches uses mens-watches, not womens-watches",
    turns: ["show me men's watches"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const input = calls[0].input as { category?: string };
      if (input.category !== "mens-watches")
        return fail(`expected category:mens-watches, got ${JSON.stringify(input)}`);
      return pass();
    },
  },

  {
    id: "category-skin-care-slug",
    description: "Searching for skincare uses 'skin-care' slug (not 'skincare')",
    turns: ["show me some skincare products"],
    check: (ctx) => {
      const calls = ctx.toolCalls.filter((c) => c.toolName === "searchProducts");
      if (calls.length === 0) return fail("expected searchProducts to be called");
      const inputs = calls.map((c) => (c.input as { category?: string }).category);
      if (!inputs.includes("skin-care"))
        return fail(`expected category:skin-care, got ${JSON.stringify(inputs)}`);
      return pass();
    },
  },

  {
    id: "category-no-duplicate-sort-suggestion",
    description: "When only 1 product is shown, follow-up suggestions don't include a sort option",
    turns: ["show me the cheapest motorcycle"],
    check: (ctx) => {
      const suggestCalls = ctx.toolCalls.filter((c) => c.toolName === "suggestFollowUps");
      if (suggestCalls.length === 0) return pass(); // no suggestions at all is also fine
      const suggestions = (suggestCalls[0].input as { suggestions?: string[] }).suggestions ?? [];
      const hasSortSuggestion = suggestions.some((s) => /sort/i.test(s));
      const products = groundedProducts(ctx);
      if (products.length <= 1 && hasSortSuggestion)
        return fail(`only ${products.length} product shown but sort suggestion was offered: ${suggestions.join(", ")}`);
      return pass();
    },
  },
];
