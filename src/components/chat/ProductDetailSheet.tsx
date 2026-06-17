/**
 * @fileoverview Product detail sheet — a slide-in panel with full product info and reviews.
 *
 * Opens when the user clicks a `ProductCard`. The sheet has two data tiers:
 * 1. **Immediately available** (from the `product` prop passed by the carousel): title,
 *    description, price, rating, availability, discount. Rendered without any loading state.
 * 2. **Fetched on open** (from `/api/products/[id]`): stock count, warranty, shipping,
 *    return policy, and up to 3 reviews. Shown behind a skeleton while loading.
 *
 * The fetch is triggered inside a `useEffect` that resets on close (`open === false`)
 * so stale detail data from a previous product doesn't flash when a new product is opened.
 * `DetailSkeleton` mirrors the exact grid structure of `DetailContent` to prevent layout
 * shift when the data loads.
 */
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Package, CheckCircle2, XCircle, Shield, Truck, RotateCcw } from "lucide-react";
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
  const filledStars = Math.round(product.rating);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        {/* ── Image ── always top, fixed height */}
        <div className="relative h-72 w-full shrink-0 overflow-hidden bg-muted">
          <Image
            src={product.thumbnail}
            alt={product.title}
            fill
            className="object-cover"
            sizes="448px"
          />
          {/* availability chip */}
          <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur-sm">
            {product.availabilityStatus}
          </span>
          {/* discount chip — bottom-right to avoid overlapping the sheet's X button */}
          {hasDiscount && (
            <span className="absolute bottom-3 right-3 rounded-full bg-[#d30005] px-3.5 py-1.5 text-[15px] font-bold text-white">
              -{Math.round(product.discountPercentage)}%
            </span>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Core info — from product prop, never needs a skeleton */}
          <div className="px-5 pt-4">
            <SheetDescription className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              {product.brand ?? product.category}
            </SheetDescription>
            <SheetTitle className="text-[20px] font-semibold leading-snug text-foreground">
              {product.title}
            </SheetTitle>

            {/* Price + rating row */}
            <div className="mt-3 flex items-end justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-[22px] font-bold text-foreground">
                  ${price.toFixed(2)}
                </span>
                {hasDiscount && (
                  <span className="text-[14px] text-muted-foreground line-through">
                    ${product.price.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[15px] text-amber-500 leading-none">
                  {"★".repeat(filledStars)}{"☆".repeat(5 - filledStars)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {product.rating.toFixed(1)} / 5
                </span>
              </div>
            </div>

            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          </div>

          {/* Divider */}
          <div className="mx-5 my-4 border-t border-border" />

          {/* Detail section — skeleton while loading */}
          <div className="px-5 pb-4">
            {loading ? (
              <DetailSkeleton />
            ) : detail ? (
              <DetailContent detail={detail} />
            ) : null}
          </div>
        </div>

        {/* ── Add to cart ── always pinned at bottom */}
        <div className="shrink-0 border-t border-border bg-background px-5 py-4">
          <Button
            className="h-12 w-full rounded-full bg-[#111111] text-[15px] font-medium text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-[#111111]"
            onClick={() => {
              addItem({ productId: product.id, title: product.title, price, quantity: 1, product });
              onOpenChange(false);
            }}
            disabled={outOfStock}
          >
            {outOfStock ? "Out of Stock" : "Add to Cart"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Info grid skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-xl bg-muted p-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      {/* Reviews skeleton */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="ml-auto h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailContent({ detail }: { detail: ProductDetail }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Stock", value: `${detail.stock} units`, icon: <Package className="h-3.5 w-3.5" /> },
          { label: "Warranty", value: detail.warrantyInformation, icon: <Shield className="h-3.5 w-3.5" /> },
          { label: "Shipping", value: detail.shippingInformation, icon: <Truck className="h-3.5 w-3.5" /> },
          { label: "Returns", value: detail.returnPolicy, icon: <RotateCcw className="h-3.5 w-3.5" /> },
        ].map(({ label, value, icon }) => (
          <div key={label} className="flex flex-col gap-1.5 rounded-xl bg-muted p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {icon}
              <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
            </div>
            <span className="text-[13px] font-medium text-foreground">{value}</span>
          </div>
        ))}
      </div>

      {/* Reviews */}
      {detail.reviews.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Reviews
          </h3>
          {detail.reviews.slice(0, 3).map((review, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
                  {review.reviewerName.charAt(0).toUpperCase()}
                </span>
                <span className="text-[13px] font-medium text-foreground">
                  {review.reviewerName}
                </span>
                <span className="ml-auto text-[12px] text-amber-500">
                  {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {review.comment}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
