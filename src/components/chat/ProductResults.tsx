/**
 * @fileoverview Thin wrapper that handles the empty-state for a `searchProducts` result.
 *
 * When the tool returns zero products (e.g. no matching items in the catalog), a
 * card with a "No matching products found" message is shown instead of an empty carousel.
 * Otherwise delegates to `ProductCarousel`.
 */
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ProductCarousel } from "./ProductCarousel";
import type { Product } from "@/lib/types";

export function ProductResults({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return null;
  }

  return <ProductCarousel products={products} />;
}
