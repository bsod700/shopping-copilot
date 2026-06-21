/**
 * @fileoverview Unit tests for `src/lib/dummyjson.ts`.
 *
 * Strategy: mock `global.fetch` per-test with `vi.fn()` so no network is hit.
 * Every test verifies exactly one behavioral contract — URL routing, query params,
 * client-side sorting logic, or error propagation — in isolation from the rest of
 * the stack (no DB, no AI, no real API key).
 *
 * Test groups:
 * - `searchProducts URL building` — verifies the three routing branches (category,
 *   search, browse) and that `select`, `limit`, `sortBy`/`order`, and the full-pool
 *   `limit=0` override for `rankBy` all produce the right URL.
 * - `searchProducts rankBy=budgetBestRated` — end-to-end sorting logic: rating filter,
 *   price-ascending sort, slice to limit, and the rating-filter fallback when nothing
 *   qualifies.
 * - `searchProducts error handling` — HTTP error and thrown exception both return
 *   `{ products: [], error }` instead of throwing.
 * - `getProduct` — single product fetch normalizes all detail fields.
 * - `listCategories` — passthrough to `/products/category-list`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchProducts, getProduct, listCategories } from "@/lib/dummyjson";

const emptyResponse = { products: [] };

function mockFetchOnce(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  }) as unknown as typeof fetch;
}

function lastFetchUrl(): string {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0] as string;
}

describe("searchProducts URL building", () => {
  beforeEach(() => {
    mockFetchOnce(emptyResponse);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses /search with q for a query", async () => {
    await searchProducts({ query: "phone" });
    const url = lastFetchUrl();
    expect(url).toContain("/products/search?");
    expect(url).toContain("q=phone");
  });

  it("uses /category/{slug} for a category", async () => {
    await searchProducts({ category: "smartphones" });
    const url = lastFetchUrl();
    expect(url).toContain("/products/category/smartphones?");
  });

  it("hits the base products endpoint when neither query nor category is given", async () => {
    await searchProducts({});
    const url = lastFetchUrl();
    expect(url).toMatch(/\/products\?/);
    expect(url).not.toContain("/search");
    expect(url).not.toContain("/category/");
  });

  it("always sets limit and select params", async () => {
    await searchProducts({ category: "laptops", limit: 3 });
    const url = lastFetchUrl();
    expect(url).toContain("limit=3");
    expect(url).toContain("select=");
  });

  it("defaults limit to 5 when not provided", async () => {
    await searchProducts({ category: "laptops" });
    const url = lastFetchUrl();
    expect(url).toContain("limit=5");
  });

  it("applies sortBy/order when rankBy is not set", async () => {
    await searchProducts({ category: "laptops", sortBy: "price", order: "asc" });
    const url = lastFetchUrl();
    expect(url).toContain("sortBy=price");
    expect(url).toContain("order=asc");
  });

  it("ignores sortBy/order and fetches the full pool when rankBy is set", async () => {
    await searchProducts({ category: "laptops", sortBy: "rating", order: "desc", rankBy: "budgetBestRated", limit: 2 });
    const url = lastFetchUrl();
    expect(url).not.toContain("sortBy=");
    expect(url).not.toContain("order=");
    expect(url).toContain("limit=0");
  });
});

describe("searchProducts rankBy=budgetBestRated", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters to rating >= 4, sorts by price ascending, and slices to limit", async () => {
    mockFetchOnce({
      products: [
        { id: 1, title: "Cheap but bad", price: 10, rating: 2.5, category: "laptops", tags: [] },
        { id: 2, title: "Mid price good rating", price: 50, rating: 4.5, category: "laptops", tags: [] },
        { id: 3, title: "Cheapest good rating", price: 20, rating: 4.0, category: "laptops", tags: [] },
        { id: 4, title: "Expensive good rating", price: 100, rating: 4.9, category: "laptops", tags: [] },
      ],
    });

    const result = await searchProducts({ category: "laptops", rankBy: "budgetBestRated", limit: 2 });

    expect(result.products).toHaveLength(2);
    expect(result.products[0].id).toBe(3);
    expect(result.products[1].id).toBe(2);
    expect(result.products.every((p) => p.rating >= 4)).toBe(true);
  });

  it("falls back to the full pool when nothing has rating >= 4", async () => {
    mockFetchOnce({
      products: [
        { id: 1, title: "A", price: 30, rating: 2.0, category: "laptops", tags: [] },
        { id: 2, title: "B", price: 10, rating: 3.5, category: "laptops", tags: [] },
      ],
    });

    const result = await searchProducts({ category: "laptops", rankBy: "budgetBestRated", limit: 5 });

    expect(result.products).toHaveLength(2);
    expect(result.products[0].id).toBe(2);
    expect(result.products[1].id).toBe(1);
  });
});

describe("searchProducts maxPrice/minPrice filtering", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("excludes products above maxPrice and fetches the full pool (limit=0)", async () => {
    mockFetchOnce({
      products: [
        { id: 1, title: "Budget Phone", price: 299, rating: 3.8, category: "smartphones", tags: [] },
        { id: 2, title: "Mid Phone",    price: 499, rating: 4.1, category: "smartphones", tags: [] },
        { id: 3, title: "Expensive",    price: 999, rating: 4.5, category: "smartphones", tags: [] },
      ],
    });

    const result = await searchProducts({ category: "smartphones", maxPrice: 500, limit: 5 });

    expect(result.products.map((p) => p.id)).toEqual([1, 2]);
    expect(result.products.every((p) => p.price <= 500)).toBe(true);
    expect(lastFetchUrl()).toContain("limit=0");
  });

  it("excludes products below minPrice", async () => {
    mockFetchOnce({
      products: [
        { id: 1, title: "Cheap",  price: 99,  rating: 3.0, category: "smartphones", tags: [] },
        { id: 2, title: "Mid",    price: 499, rating: 4.0, category: "smartphones", tags: [] },
        { id: 3, title: "Pricey", price: 899, rating: 4.3, category: "smartphones", tags: [] },
      ],
    });

    const result = await searchProducts({ category: "smartphones", minPrice: 400, limit: 5 });

    expect(result.products.map((p) => p.id)).toEqual([2, 3]);
    expect(result.products.every((p) => p.price >= 400)).toBe(true);
  });

  it("returns empty when no products are within the price range", async () => {
    mockFetchOnce({
      products: [
        { id: 1, title: "Pricey A", price: 800, rating: 4.0, category: "smartphones", tags: [] },
        { id: 2, title: "Pricey B", price: 900, rating: 4.5, category: "smartphones", tags: [] },
      ],
    });

    const result = await searchProducts({ category: "smartphones", maxPrice: 500, limit: 5 });

    expect(result.products).toHaveLength(0);
  });
});

describe("searchProducts error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an error and empty products array when the request fails", async () => {
    mockFetchOnce({}, false);
    const result = await searchProducts({ category: "laptops" });
    expect(result.products).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it("returns an error when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const result = await searchProducts({ category: "laptops" });
    expect(result.products).toEqual([]);
    expect(result.error).toBeTruthy();
  });
});

describe("getProduct", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches a single product by id and normalizes it", async () => {
    mockFetchOnce({
      id: 42,
      title: "Test Product",
      description: "desc",
      price: 9.99,
      rating: 4.2,
      category: "laptops",
      tags: ["laptops"],
      stock: 12,
      images: ["a.png"],
      warrantyInformation: "1 year",
      returnPolicy: "30 days",
      shippingInformation: "Ships in 2 days",
      reviews: [{ rating: 5, comment: "Great", reviewerName: "Alice" }],
    });

    const result = await getProduct(42);

    expect(result.error).toBeUndefined();
    expect(result.product?.id).toBe(42);
    expect(result.product?.stock).toBe(12);
    expect(result.product?.reviews).toHaveLength(1);
    expect(lastFetchUrl()).toContain("/products/42");
  });

  it("returns an error when the product fetch fails", async () => {
    mockFetchOnce({}, false);
    const result = await getProduct(999);
    expect(result.product).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

describe("listCategories", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the raw category list", async () => {
    mockFetchOnce(["smartphones", "laptops", "fragrances"]);
    const result = await listCategories();
    expect(result.categories).toEqual(["smartphones", "laptops", "fragrances"]);
    expect(lastFetchUrl()).toContain("/products/category-list");
  });
});
