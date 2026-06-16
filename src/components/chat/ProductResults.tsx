"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ProductCarousel } from "./ProductCarousel";
import type { Product } from "@/lib/types";

export function ProductResults({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="text-sm text-muted-foreground">
          No matching products found.
        </CardContent>
      </Card>
    );
  }

  return <ProductCarousel products={products} />;
}
