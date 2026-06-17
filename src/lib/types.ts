/**
 * @fileoverview Shared domain types.
 *
 * `Product` is the normalized subset returned by list/search endpoints (lighter payload).
 * `ProductDetail` extends it with fields only available from the single-product endpoint —
 * used when the user asks follow-up questions ("is it in stock?", "what do reviews say?").
 */

/** Normalized product from a search or category listing. Returned by `searchProducts`. */
export interface Product {
  id: number;
  title: string;
  description: string;
  price: number;
  /** 0 if no discount. Applied discount: `price * (1 - discountPercentage / 100)`. */
  discountPercentage: number;
  rating: number;
  category: string;
  thumbnail: string;
  availabilityStatus: string;
  brand?: string;
  tags: string[];
}

/**
 * Full product record from the single-product endpoint (`GET /products/{id}`).
 * Extends `Product` with stock count, full image gallery, logistics info, and reviews.
 * Only fetched on demand via `getProduct` to avoid over-fetching on list views.
 */
export interface ProductDetail extends Product {
  stock: number;
  images: string[];
  warrantyInformation: string;
  returnPolicy: string;
  shippingInformation: string;
  reviews: Array<{ rating: number; comment: string; reviewerName: string }>;
}
