/**
 * @fileoverview DummyJSON Products API client and normalizer.
 *
 * Three public functions:
 * - `searchProducts` — search/filter/sort the catalog (main retrieval path)
 * - `getProduct` — fetch full details for one product by id
 * - `listCategories` — get all 24 category slugs (cached 24h, data never changes)
 *
 * All functions return a result object (`{ products/product/categories, error? }`)
 * rather than throwing, so the AI tool layer can forward errors to the model
 * honestly instead of letting an unhandled exception crash the route.
 *
 * Fetch is wrapped with a 5-second timeout via `AbortSignal.timeout` and Next.js
 * data-cache revalidation (`next: { revalidate: 3600 }`) so repeated identical
 * queries within an hour hit the cache, not the network.
 */
import type { Product, ProductDetail } from "./types";

const BASE_URL = "https://dummyjson.com/products";
const SELECT_FIELDS =
  "id,title,description,price,thumbnail,category,rating,discountPercentage,availabilityStatus,brand,tags";

// Wrap fetch with a timeout + try/catch so callers always get a result object,
// never a thrown error (the model should relay "search failed" honestly).
async function safeFetchJson<T>(
  url: string,
  revalidate = 3600,
): Promise<{ data: T | null; error?: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate },
    });
    if (!res.ok) {
      return { data: null, error: `Request failed with status ${res.status}` };
    }
    return { data: (await res.json()) as T };
  } catch {
    return { data: null, error: "Network error while contacting the product catalog" };
  }
}

function normalizeProduct(raw: Record<string, unknown>): Product {
  return {
    id: raw.id as number,
    title: raw.title as string,
    description: ((raw.description as string) ?? "").slice(0, 200),
    price: raw.price as number,
    discountPercentage: (raw.discountPercentage as number) ?? 0,
    rating: Math.round(((raw.rating as number) ?? 0) * 10) / 10,
    category: raw.category as string,
    thumbnail: raw.thumbnail as string,
    availabilityStatus: (raw.availabilityStatus as string) ?? "Unknown",
    brand: raw.brand as string | undefined,
    tags: (raw.tags as string[]) ?? [],
  };
}

/** Input shape for `searchProducts`, shared with the AI tool schema. */
export interface SearchProductsInput {
  query?: string;
  category?: string;
  sortBy?: "price" | "rating" | "title" | "discountPercentage";
  order?: "asc" | "desc";
  /** `"budgetBestRated"`: filters to rating >= 4 then sorts cheapest first. Overrides sortBy/order.
   *  `"biggestDiscount"`: keeps only products with a discount > 0, sorts by discountPercentage desc.
   *  `"discountedBestRated"`: keeps only products with a discount > 0, sorts by rating desc. */
  rankBy?: "budgetBestRated" | "biggestDiscount" | "discountedBestRated";
  limit?: number;
  minRating?: number;
  inStock?: boolean;
  /** Keep only products whose tags array contains at least one of these values (case-insensitive). */
  filterByTags?: string[];
  /** If true, return ONLY out-of-stock products (opposite of inStock). */
  outOfStock?: boolean;
  /** Keep only products where this color word appears in the title OR description (case-insensitive). */
  colorFilter?: string;
}

/** Result envelope returned by `searchProducts`. `error` is set on network/API failure. */
export interface SearchProductsResult {
  products: Product[];
  error?: string;
}

/**
 * Search and filter the DummyJSON product catalog.
 *
 * Route selection (in priority order):
 * 1. `category` set → `/products/category/{slug}` (most precise for named categories)
 * 2. `query` set → `/products/search?q=` (free-text across title + description)
 * 3. Neither → `/products` (full catalog, useful with sortBy/order)
 *
 * When both `category` and `query` are provided, the category endpoint is used and
 * the query is applied as a client-side title/tag filter afterwards — the DummyJSON
 * API silently ignores `q` on category endpoints.
 *
 * Sorting is always applied client-side after fetching the full result pool, because
 * DummyJSON's server-side sort is unreliable on category endpoints.
 *
 * DummyJSON has no price-range filter (`minPrice`/`maxPrice`). "Cheap" queries are
 * approximated by `sortBy:"price", order:"asc"` — an intentional, documented trade-off.
 */
export async function searchProducts({
  query,
  category,
  sortBy,
  order,
  rankBy,
  limit = 5,
  minRating,
  inStock,
  filterByTags,
  outOfStock,
  colorFilter,
}: SearchProductsInput): Promise<SearchProductsResult> {
  // Both a category and a query narrowing the same call: filter the category's
  // products by query afterwards (see below), so pull the full category pool here.
  const bothSet = Boolean(category && query);

  const params = new URLSearchParams();
  // Pull the full pool whenever we need to rank, sort, or filter a category by
  // query — so the sort/rank/filter operates on every candidate, not just the
  // first N that happen to come back first.
  params.set("limit", String(rankBy || bothSet || sortBy || filterByTags?.length || outOfStock ? 0 : limit));
  params.set("select", SELECT_FIELDS);
  if (sortBy && !rankBy) params.set("sortBy", sortBy);
  if (order && !rankBy) params.set("order", order);

  // DummyJSON has no endpoint that filters by both at once, and combining them
  // (q against /category, or vice versa) silently drops one filter and can zero
  // out results. category is the more precise filter, so it wins if both are set;
  // the query is applied as a post-fetch title/tag filter below instead.
  let url: string;
  if (category) {
    url = `${BASE_URL}/category/${encodeURIComponent(category)}?${params.toString()}`;
  } else if (query) {
    params.set("q", query);
    url = `${BASE_URL}/search?${params.toString()}`;
  } else {
    url = `${BASE_URL}?${params.toString()}`;
  }

  const { data, error } = await safeFetchJson<{ products: Record<string, unknown>[] }>(url);
  if (error || !data) {
    return { products: [], error };
  }
  let products = data.products.map(normalizeProduct);

  // When filterByTags is set it is the authoritative sub-filter; skip the text-query
  // pass so a stray query param can't accidentally zero out the tag-filtered set.
  if (bothSet && !filterByTags?.length) {
    const q = query!.toLowerCase();
    products = products.filter(
      (p) => p.title.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  // Apply explicit filters before ranking/sorting
  if (filterByTags && filterByTags.length > 0) {
    const allowed = filterByTags.map((t) => t.toLowerCase());
    products = products.filter((p) => p.tags.some((t) => allowed.includes(t.toLowerCase())));
  }
  if (outOfStock) {
    products = products.filter((p) => p.availabilityStatus === "Out of Stock");
  } else if (inStock) {
    products = products.filter((p) => p.availabilityStatus !== "Out of Stock");
  }
  if (minRating != null) {
    products = products.filter((p) => p.rating >= minRating);
  }
  if (colorFilter) {
    const color = colorFilter.toLowerCase();
    products = products.filter(
      (p) => p.title.toLowerCase().includes(color) || p.description.toLowerCase().includes(color),
    );
  }

  if (rankBy === "budgetBestRated") {
    const GOOD_RATING = minRating ?? 4;
    const wellRated = products.filter((p) => p.rating >= GOOD_RATING);
    wellRated.sort((a, b) => a.price - b.price);
    return { products: wellRated.slice(0, limit) };
  }

  if (rankBy === "biggestDiscount") {
    const discounted = products.filter((p) => p.discountPercentage > 0);
    discounted.sort((a, b) => b.discountPercentage - a.discountPercentage);
    return { products: discounted.slice(0, limit) };
  }

  if (rankBy === "discountedBestRated") {
    const discounted = products.filter((p) => p.discountPercentage > 0);
    discounted.sort((a, b) => b.rating - a.rating);
    return { products: discounted.slice(0, limit) };
  }

  // Client-side sort guarantee — API sort isn't always reliable for category
  // endpoints, so we always sort ourselves after fetching the full pool above.
  if (sortBy) {
    const dir = order === "asc" ? 1 : -1;
    products.sort((a, b) => {
      const av = a[sortBy as keyof Product];
      const bv = b[sortBy as keyof Product];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return 0;
    });
  }

  return { products: products.slice(0, limit) };
}

/** Result envelope returned by `getProduct`. `product` is null on error. */
export interface GetProductResult {
  product: ProductDetail | null;
  error?: string;
}

/**
 * Fetch full details for a single product by numeric id.
 *
 * Returns the extended `ProductDetail` type which includes stock count, images,
 * warranty, return policy, shipping info, and reviews. Used when the user asks
 * follow-up questions about a specific product already shown in search results.
 */
export async function getProduct(id: number): Promise<GetProductResult> {
  const { data, error } = await safeFetchJson<Record<string, unknown>>(`${BASE_URL}/${id}`);
  if (error || !data) {
    return { product: null, error };
  }
  return {
    product: {
      ...normalizeProduct(data),
      stock: data.stock as number,
      images: (data.images as string[]) ?? [],
      warrantyInformation: (data.warrantyInformation as string) ?? "",
      returnPolicy: (data.returnPolicy as string) ?? "",
      shippingInformation: (data.shippingInformation as string) ?? "",
      reviews:
        (data.reviews as Array<{ rating: number; comment: string; reviewerName: string }>) ?? [],
    },
  };
}

/** Result envelope returned by `listCategories`. */
export interface ListCategoriesResult {
  categories: string[];
  error?: string;
}

/**
 * Fetch the full list of DummyJSON category slugs.
 *
 * The category list is static demo data that never changes, so it is cached
 * aggressively (24-hour revalidation) via Next.js data cache. The model calls
 * this when it's unsure of the exact slug for a user's request, since slugs
 * are sometimes non-obvious (e.g. `"womens-jewellery"` not `"jewelry"`).
 */
export async function listCategories(): Promise<ListCategoriesResult> {
  // Category list is static demo data, cache aggressively (24h).
  const { data, error } = await safeFetchJson<string[]>(`${BASE_URL}/category-list`, 86400);
  if (error || !data) {
    return { categories: [], error };
  }
  return { categories: data };
}
