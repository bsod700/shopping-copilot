/**
 * @fileoverview Product card — displays a single product in the search results carousel.
 *
 * Shows thumbnail, title, description snippet, discounted/original price, star rating,
 * availability status chip, discount percentage chip, and cart quantity badge.
 *
 * Clicking the card body (excluding the Add to Cart button) opens the detail sheet via
 * the `onSelect` callback. `e.stopPropagation()` on the Add to Cart button prevents it
 * from also triggering `onSelect`.
 *
 * The `data-testid="product-card"` attribute is used by Playwright E2E tests.
 */
"use client";

import Image from "next/image";
import type { Product } from "@/lib/types";
import { useCart } from "./CartContext";

function StarRating({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={i} viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
            <polygon
              points="10,1 12.9,7 19.5,7.6 14.5,12 16.2,18.5 10,15 3.8,18.5 5.5,12 0.5,7.6 7.1,7"
              fill={i < filled ? "#f59e0b" : "none"}
              stroke={i < filled ? "#f59e0b" : "#d1d5db"}
              strokeWidth="1.2"
            />
          </svg>
        ))}
      </div>
      <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

export function ProductCard({
  product,
  onSelect,
}: {
  product: Product;
  onSelect?: (product: Product) => void;
}) {
  const { addItem, items } = useCart();
  const cartQty = items.find((i) => i.productId === product.id)?.quantity ?? 0;
  const hasDiscount = product.discountPercentage >= 1;
  const discountedPrice = hasDiscount
    ? product.price * (1 - product.discountPercentage / 100)
    : product.price;
  const outOfStock = product.availabilityStatus === "Out of Stock";

  return (
    <div
      data-testid="product-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(product)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect?.(product);
      }}
      className="w-full cursor-pointer select-none overflow-hidden rounded-xl border border-border bg-card"
    >
      {/* Image with chips */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        <Image
          src={product.thumbnail}
          alt={product.title}
          width={300}
          height={300}
          className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
        />
        <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2.5 py-1 text-[12px] font-medium text-foreground backdrop-blur-sm">
          {product.availabilityStatus}
        </span>
        {hasDiscount && (
          <span className="absolute right-2 top-2 rounded-full bg-[#d30005] px-2.5 py-1 text-[12px] font-medium text-white">
            -{Math.round(product.discountPercentage)}%
          </span>
        )}
        {cartQty > 0 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-[#d30005] px-2.5 py-1 text-[12px] font-bold text-white">
            {cartQty} in cart
          </span>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-col gap-2 p-4">
        <p className="line-clamp-1 text-[18px] font-semibold leading-snug text-foreground">
          {product.title}
        </p>
        <p className="line-clamp-2 text-[16px] leading-relaxed text-muted-foreground">
          {product.description}
        </p>

        {/* Price row */}
        <div className="flex items-baseline gap-2">
          {hasDiscount ? (
            <>
              <span className="text-[20px] font-bold text-[#d30005]">
                ${discountedPrice.toFixed(2)}
              </span>
              <span className="text-[14px] text-muted-foreground line-through">
                ${product.price.toFixed(2)}
              </span>
            </>
          ) : (
            <span className="text-[20px] font-bold text-foreground">
              ${product.price.toFixed(2)}
            </span>
          )}
        </div>

        <StarRating rating={product.rating} />

        {/* Add to Cart */}
        <button
          type="button"
          disabled={outOfStock}
          onClick={(e) => {
            e.stopPropagation();
            addItem({ productId: product.id, title: product.title, price: discountedPrice, quantity: 1, product });
          }}
          className="mt-1 h-11 w-full rounded-full bg-[#111111] text-[15px] font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-[#111111]"
        >
          {outOfStock ? "Out of Stock" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}
