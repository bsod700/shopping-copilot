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
  limit?: number;
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
  limit = 5,
}: SearchProductsInput): Promise<SearchProductsResult> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("select", SELECT_FIELDS);
  if (sortBy) params.set("sortBy", sortBy);
  if (order) params.set("order", order);

  let url: string;
  if (query) {
    params.set("q", query);
    url = `${BASE_URL}/search?${params.toString()}`;
  } else if (category) {
    url = `${BASE_URL}/category/${encodeURIComponent(category)}?${params.toString()}`;
  } else {
    url = `${BASE_URL}?${params.toString()}`;
  }

  const { data, error } = await safeFetchJson<{ products: Record<string, unknown>[] }>(url);
  if (error || !data) {
    return { products: [], error };
  }
  return { products: data.products.map(normalizeProduct) };
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
