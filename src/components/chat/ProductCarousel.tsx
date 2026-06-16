"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";
import { ProductDetailSheet } from "./ProductDetailSheet";

const CARD_WIDTH = 300;
const GAP = 16;
const CARD_STEP = CARD_WIDTH + GAP;

export function ProductCarousel({ products }: { products: Product[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollRight, setCanScrollRight] = useState(products.length > 1);
  const [snapCount, setSnapCount] = useState(products.length);

  const canScrollLeft = activeIndex > 0;
  const [selected, setSelected] = useState<Product | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Tracks intended index synchronously so rapid clicks don't read stale state.
  const intendedIndex = useRef(0);
  // Suppresses scroll events while a programmatic smooth-scroll is animating.
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  const updateScrollState = useCallback(() => {
    if (isProgrammaticScroll.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    // How many snap positions exist given the actual scroll range
    setSnapCount(Math.min(Math.round(maxScroll / CARD_STEP) + 1, products.length));
    const idx = Math.max(0, Math.min(Math.round(el.scrollLeft / CARD_STEP), products.length - 1));
    intendedIndex.current = idx;
    setActiveIndex(idx);
    setCanScrollRight(el.scrollLeft < maxScroll - 8);
  }, [products.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollState);
  }, [updateScrollState]);

  function scrollToIndex(index: number) {
    const clamped = Math.max(0, Math.min(index, products.length - 1));
    const el = scrollRef.current;
    const maxScroll = el ? el.scrollWidth - el.clientWidth : Infinity;
    const targetScroll = clamped * CARD_STEP;

    intendedIndex.current = clamped;
    setActiveIndex(clamped);
    setCanScrollRight(targetScroll < maxScroll - 8);

    isProgrammaticScroll.current = true;
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    programmaticScrollTimer.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
      // Re-sync after animation in case scroll clamped to a different position.
      if (el) {
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
      }
    }, 500);

    el?.scrollTo({ left: targetScroll, behavior: "smooth" });
  }

  function scrollByOne(direction: "left" | "right") {
    const next = direction === "right" ? intendedIndex.current + 1 : intendedIndex.current - 1;
    scrollToIndex(next);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") return;
    isDragging.current = true;
    hasDragged.current = false;
    dragStartX.current = e.clientX;
    dragScrollLeft.current = scrollRef.current?.scrollLeft ?? 0;
    // Don't capture pointer yet — only capture once we confirm it's a drag,
    // otherwise the click event gets routed away from the card and the drawer won't open.
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging.current || !scrollRef.current) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > 4) {
      hasDragged.current = true;
      if (!scrollRef.current.hasPointerCapture(e.pointerId)) {
        scrollRef.current.setPointerCapture(e.pointerId);
      }
    }
    scrollRef.current.scrollLeft = dragScrollLeft.current - dx;
  }

  function handlePointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (scrollRef.current) {
      const nearest = Math.round(scrollRef.current.scrollLeft / CARD_STEP);
      scrollToIndex(Math.max(0, Math.min(nearest, products.length - 1)));
    }
  }

  return (
    <div className="relative w-full max-w-[991px]">
      <div
        className="relative overflow-hidden"
        style={{
          maskImage: canScrollLeft && canScrollRight
            ? "linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)"
            : canScrollLeft
            ? "linear-gradient(to right, transparent 0%, black 4%, black 100%)"
            : canScrollRight
            ? "linear-gradient(to right, black 0%, black 96%, transparent 100%)"
            : "none",
          WebkitMaskImage: canScrollLeft && canScrollRight
            ? "linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)"
            : canScrollLeft
            ? "linear-gradient(to right, transparent 0%, black 4%, black 100%)"
            : canScrollRight
            ? "linear-gradient(to right, black 0%, black 96%, transparent 100%)"
            : "none",
        }}
      >
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2"
          style={{
            scrollSnapType: "x mandatory",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            cursor: isDragging.current ? "grabbing" : "grab",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div className="w-2 shrink-0" />
          {products.map((product) => (
            <div key={product.id} style={{ scrollSnapAlign: "start" }}>
              <ProductCard
                product={product}
                onSelect={(p) => {
                  if (!hasDragged.current) {
                    setSelected(p);
                    setSheetOpen(true);
                  }
                }}
              />
            </div>
          ))}
          <div className="w-2 shrink-0" />
        </div>
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByOne("left")}
          aria-label="Previous products"
          className="absolute left-1 top-[100px] z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background text-foreground shadow-md transition-colors hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByOne("right")}
          aria-label="Next products"
          className="absolute right-1 top-[100px] z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background text-foreground shadow-md transition-colors hover:bg-muted"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {snapCount > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {Array.from({ length: snapCount }).map((_, dotIndex) => (
            <button
              key={dotIndex}
              type="button"
              aria-label={`Go to product ${dotIndex + 1}`}
              onClick={() => scrollToIndex(dotIndex)}
              className={cn(
                "h-2 rounded-full transition-all duration-200",
                dotIndex === activeIndex ? "w-4 bg-foreground" : "w-2 bg-muted-foreground/40",
              )}
            />
          ))}
        </div>
      )}

      <ProductDetailSheet product={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
