"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ProductCard } from "./ProductCard";
import { ProductDetailSheet } from "./ProductDetailSheet";
import type { Product } from "@/lib/types";

export function ProductResults({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  if (products.length === 0) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="text-sm text-muted-foreground">
          No matching products found.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onSelect={(p) => {
              setSelected(p);
              setOpen(true);
            }}
          />
        ))}
      </div>
      <ProductDetailSheet product={selected} open={open} onOpenChange={setOpen} />
    </>
  );
}
