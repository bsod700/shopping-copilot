"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { useCart } from "./CartContext";
import { ProductDetailSheet } from "./ProductDetailSheet";
import type { Product } from "@/lib/types";

export function CartBar() {
  const { items, removeItem, setQuantity, clear, total } = useCart();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  async function openDetail(productId: number, cachedProduct?: Product) {
    if (cachedProduct) {
      setDetailProduct(cachedProduct);
      setDetailOpen(true);
      return;
    }
    setLoadingId(productId);
    try {
      const res = await fetch(`/api/products/${productId}`);
      const data = await res.json();
      if (data.product) {
        setDetailProduct(data.product);
        setDetailOpen(true);
      }
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      <div className="flex w-full items-center justify-end border-b bg-background px-4 py-2">
        <Sheet>
          {/* ── Cart drawer ── */}
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <div>
                <SheetTitle className="text-[18px] font-semibold text-foreground">
                  Your Cart
                </SheetTitle>
                <SheetDescription className="text-[12px] text-muted-foreground">
                  {count === 0 ? "No items yet" : `${count} item${count !== 1 ? "s" : ""}`}
                </SheetDescription>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <ShoppingBag className="h-7 w-7 text-muted-foreground" />
                  </span>
                  <p className="text-[15px] font-medium text-foreground">Your cart is empty</p>
                  <p className="text-[13px] text-muted-foreground">
                    Browse products and add items to get started.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {items.map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-center gap-3 rounded-xl border border-border p-3"
                    >
                      {/* Clickable title area */}
                      <button
                        type="button"
                        onClick={() => openDetail(item.productId, item.product)}
                        disabled={loadingId === item.productId}
                        className="min-w-0 flex-1 cursor-pointer text-left"
                      >
                        <p className="truncate text-[14px] font-medium text-foreground">
                          {item.title}
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          ${item.price.toFixed(2)} each
                        </p>
                      </button>

                      {/* Qty controls */}
                      <div className="flex shrink-0 items-center gap-1 rounded-full border border-border px-1 py-0.5">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => setQuantity(item.productId, item.quantity - 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-5 text-center text-[13px] font-medium text-foreground">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => setQuantity(item.productId, item.quantity + 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Line total */}
                      <span className="w-14 shrink-0 text-right text-[14px] font-semibold text-foreground">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>

                      {/* Chevron hint */}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                      {/* Remove */}
                      <button
                        type="button"
                        aria-label="Remove item"
                        onClick={() => removeItem(item.productId)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-[#d30005]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer — always pinned at bottom */}
            <div className="shrink-0 border-t border-border bg-background px-5 py-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
                  Total
                </span>
                <span className="text-[22px] font-bold text-foreground">
                  ${total.toFixed(2)}
                </span>
              </div>
              <SheetClose
                render={
                  <Button
                    className="h-12 w-full rounded-full bg-[#111111] text-[15px] font-medium text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-[#111111]"
                    disabled={items.length === 0}
                  />
                }
                onClick={() => {
                  clear();
                  toast.success("Order placed!");
                }}
              >
                Checkout
              </SheetClose>
            </div>
          </SheetContent>

          {/* ── Cart trigger button ── */}
          <SheetTrigger render={<button type="button" aria-label="Open cart" className="relative" />}>
            <span id="cart-bag-icon" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted">
              <ShoppingBag className="h-4 w-4" />
            </span>
            {count > 0 && (
              <span
                key={count}
                aria-hidden="true"
                className="badge-pop absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d30005] px-1 text-[10px] font-bold text-white"
              >
                {count}
              </span>
            )}
          </SheetTrigger>
        </Sheet>
      </div>

      {/* Product detail sheet — rendered outside the cart Sheet to avoid nesting */}
      <ProductDetailSheet
        product={detailProduct}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
