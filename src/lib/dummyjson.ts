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
    description: raw.description as string,
    price: raw.price as number,
    discountPercentage: (raw.discountPercentage as number) ?? 0,
    rating: (raw.rating as number) ?? 0,
    category: raw.category as string,
    thumbnail: raw.thumbnail as string,
    availabilityStatus: (raw.availabilityStatus as string) ?? "Unknown",
    brand: raw.brand as string | undefined,
    tags: (raw.tags as string[]) ?? [],
  };
}

export interface SearchProductsInput {
  query?: string;
  category?: string;
  sortBy?: "price" | "rating" | "title";
  order?: "asc" | "desc";
  rankBy?: "budgetBestRated";
  limit?: number;
  minRating?: number;
  inStock?: boolean;
}

export interface SearchProductsResult {
  products: Product[];
  error?: string;
}

export async function searchProducts({
  query,
  category,
  sortBy,
  order,
  rankBy,
  limit = 5,
  minRating,
  inStock,
}: SearchProductsInput): Promise<SearchProductsResult> {
  // Both a category and a query narrowing the same call: filter the category's
  // products by query afterwards (see below), so pull the full category pool here.
  const bothSet = Boolean(category && query);

  const params = new URLSearchParams();
  // Pull the full pool whenever we need to rank, sort, or filter a category by
  // query — so the sort/rank/filter operates on every candidate, not just the
  // first N that happen to come back first.
  params.set("limit", String(rankBy || bothSet || sortBy ? 0 : limit));
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

  if (bothSet) {
    const q = query!.toLowerCase();
    products = products.filter(
      (p) => p.title.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  // Apply explicit filters before ranking/sorting
  if (inStock) {
    products = products.filter((p) => p.availabilityStatus !== "Out of Stock");
  }
  if (minRating != null) {
    products = products.filter((p) => p.rating >= minRating);
  }

  if (rankBy === "budgetBestRated") {
    const GOOD_RATING = minRating ?? 4;
    const wellRated = products.filter((p) => p.rating >= GOOD_RATING);
    const pool = wellRated.length > 0 ? wellRated : products;
    pool.sort((a, b) => a.price - b.price);
    return { products: pool.slice(0, limit) };
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

export interface GetProductResult {
  product: ProductDetail | null;
  error?: string;
}

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

export interface ListCategoriesResult {
  categories: string[];
  error?: string;
}

export async function listCategories(): Promise<ListCategoriesResult> {
  // Category list is static demo data, cache aggressively (24h).
  const { data, error } = await safeFetchJson<string[]>(`${BASE_URL}/category-list`, 86400);
  if (error || !data) {
    return { categories: [], error };
  }
  return { categories: data };
}
