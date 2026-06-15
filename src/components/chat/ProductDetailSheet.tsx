"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "./CartContext";
import type { Product, ProductDetail } from "@/lib/types";

export function ProductDetailSheet({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const { addItem } = useCart();

  useEffect(() => {
    if (!open || !product) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetch(`/api/products/${product.id}`)
      .then((res) => res.json())
      .then((data) => setDetail(data.product ?? null))
      .finally(() => setLoading(false));
  }, [open, product]);

  if (!product) return null;

  const hasDiscount = product.discountPercentage > 0;
  const price = hasDiscount
    ? product.price * (1 - product.discountPercentage / 100)
    : product.price;
  const outOfStock = product.availabilityStatus === "Out of Stock";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{product.title}</SheetTitle>
          <SheetDescription>{product.brand ?? product.category}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <Image
            src={product.thumbnail}
            alt={product.title}
            width={400}
            height={400}
            className="aspect-square w-full rounded-lg object-cover"
          />

          <div className="flex flex-wrap items-center gap-2">
            {hasDiscount && (
              <span className="text-sm text-muted-foreground line-through">
                ${product.price.toFixed(2)}
              </span>
            )}
            <span className="text-lg font-semibold">${price.toFixed(2)}</span>
            {hasDiscount && (
              <Badge variant="destructive">-{product.discountPercentage.toFixed(0)}%</Badge>
            )}
            <Badge variant="secondary">⭐ {product.rating.toFixed(1)}</Badge>
          </div>

          <p className="text-sm text-muted-foreground">{product.description}</p>

          {loading && <Skeleton className="h-24 w-full" />}

          {detail && (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Stock: {detail.stock}</span>
                <span>Status: {detail.availabilityStatus}</span>
                <span>Warranty: {detail.warrantyInformation}</span>
                <span>Shipping: {detail.shippingInformation}</span>
                <span className="col-span-2">Returns: {detail.returnPolicy}</span>
              </div>

              {detail.reviews.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">Reviews</h3>
                  {detail.reviews.slice(0, 3).map((review, i) => (
                    <div key={i} className="rounded-md border p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{review.reviewerName}</span>
                        <span>⭐ {review.rating}</span>
                      </div>
                      <p className="text-muted-foreground">{review.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <Button
            onClick={() => {
              addItem({ productId: product.id, title: product.title, price, quantity: 1 });
              onOpenChange(false);
            }}
            disabled={outOfStock}
          >
            {outOfStock ? "Out of stock" : "Add to cart"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
