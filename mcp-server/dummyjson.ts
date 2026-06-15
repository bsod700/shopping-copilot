// Standalone copy of src/lib/dummyjson.ts's searchProducts, trimmed to what
// the MCP server needs. Kept in sync by hand since this package has no
// dependency on the Next.js app (see BUILD_PLAN.md Section 8).

const BASE_URL = "https://dummyjson.com/products";
const SELECT_FIELDS =
  "id,title,description,price,thumbnail,category,rating,discountPercentage,availabilityStatus,brand,tags";

export interface Product {
  id: number;
  title: string;
  description: string;
  price: number;
  discountPercentage: number;
  rating: number;
  category: string;
  thumbnail: string;
  availabilityStatus: string;
  brand?: string;
  tags: string[];
}

export interface SearchProductsInput {
  query?: string;
  category?: string;
  sortBy?: "price" | "rating" | "title";
  order?: "asc" | "desc";
  limit?: number;
}

export interface SearchProductsResult {
  products: Product[];
  error?: string;
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

export async function searchProducts({
  query,
  category,
  sortBy,
  order,
  limit = 5,
}: SearchProductsInput): Promise<SearchProductsResult> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("select", SELECT_FIELDS);
  if (sortBy) params.set("sortBy", sortBy);
  if (order) params.set("order", order);

  let url: string;
  if (category) {
    url = `${BASE_URL}/category/${encodeURIComponent(category)}?${params.toString()}`;
  } else if (query) {
    params.set("q", query);
    url = `${BASE_URL}/search?${params.toString()}`;
  } else {
    url = `${BASE_URL}?${params.toString()}`;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { products: [], error: `Request failed with status ${res.status}` };
    }
    const data = (await res.json()) as { products: Record<string, unknown>[] };
    return { products: data.products.map(normalizeProduct).slice(0, limit) };
  } catch {
    return { products: [], error: "Network error while contacting the product catalog" };
  }
}
