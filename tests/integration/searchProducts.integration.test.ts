/**
 * @fileoverview Integration tests for `searchProducts` and `getProduct` using a realistic fixture.
 *
 * Unlike the unit tests, which verify URL routing and sorting logic with minimal stub data,
 * these tests feed a fixture that mirrors a real DummyJSON response (`tests/fixtures/products.json`)
 * to verify that the full normalization pipeline — field mapping, type coercion, `brand`,
 * `availabilityStatus`, nested `reviews` — produces properly shaped `Product`/`ProductDetail`
 * objects that the UI and AI tools can consume without surprises.
 *
 * `global.fetch` is still mocked (no real network) so tests are deterministic, but the fixture
 * payload is rich enough to catch shape mismatches that minimal stubs would miss.
 *
 * The `rankBy=budgetBestRated` test uses the fixture's real rating values to verify that
 * Apple MacBook Pro (rating 2.99) is excluded while Lenovo (1199.99, rating ≥4) wins.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { searchProducts, getProduct } from "@/lib/dummyjson";
import fixture from "../fixtures/products.json";

function mockFetchOnce(body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("searchProducts (integration, realistic fixture)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes a realistic DummyJSON response into Product[]", async () => {
    mockFetchOnce(fixture);

    const result = await searchProducts({ category: "laptops", limit: 5 });

    expect(result.error).toBeUndefined();
    expect(result.products).toHaveLength(3);

    const first = result.products[0];
    expect(first).toMatchObject({
      id: 6,
      title: "Huawei Matebook X Pro",
      price: 1399.99,
      category: "laptops",
      brand: "Huawei",
      availabilityStatus: "In Stock",
    });
    expect(typeof first.description).toBe("string");
    expect(typeof first.thumbnail).toBe("string");
    expect(Array.isArray(first.tags)).toBe(true);
  });

  it("ranks well-rated laptops by price with rankBy=budgetBestRated", async () => {
    mockFetchOnce(fixture);

    const result = await searchProducts({ category: "laptops", rankBy: "budgetBestRated", limit: 1 });

    // Apple MacBook Pro has rating 2.99 (excluded), so the cheapest of the
    // remaining well-rated laptops (Huawei 1399.99, Lenovo 1199.99) wins.
    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe(2);
    expect(result.products[0].rating).toBeGreaterThanOrEqual(4);
  });
});

describe("getProduct (integration, realistic fixture)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes a single product detail response", async () => {
    mockFetchOnce({
      ...fixture.products[0],
      stock: 45,
      images: ["https://cdn.dummyjson.com/products/images/laptops/Huawei%20Matebook%20X%20Pro/1.png"],
      warrantyInformation: "2 year warranty",
      returnPolicy: "30 days return policy",
      shippingInformation: "Ships in 1 week",
      reviews: [
        { rating: 5, comment: "Excellent laptop!", reviewerName: "John Doe" },
        { rating: 4, comment: "Great value", reviewerName: "Jane Smith" },
      ],
    });

    const result = await getProduct(6);

    expect(result.error).toBeUndefined();
    expect(result.product).toMatchObject({
      id: 6,
      title: "Huawei Matebook X Pro",
      stock: 45,
      warrantyInformation: "2 year warranty",
      returnPolicy: "30 days return policy",
    });
    expect(result.product?.reviews).toHaveLength(2);
    expect(result.product?.images).toHaveLength(1);
  });
});
