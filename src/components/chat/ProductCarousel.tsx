"use client";

import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";
import { ProductDetailSheet } from "./ProductDetailSheet";

const GAP = 16;

// Max card width across all breakpoints.
const MAX_CARD_WIDTH = 350;

// Card width controls how many cards are visible at once (peek effect).
// Scrolling is always 1 card at a time regardless of how many are visible.
// ≥700px  → 2 full + peek of 3rd:  width = (container - gap) / 2.3, capped at MAX_CARD_WIDTH
// 350–699 → 1 full + peek of 2nd:  width = container / 1.2,         capped at MAX_CARD_WIDTH
// <350    → exactly 1 card:         width = container (no cap needed, container is already small)
function getCardWidth(containerWidth: number): number {
  if (containerWidth < 350) return containerWidth;
  if (containerWidth < 700) return Math.min(Math.floor(containerWidth / 1.2), MAX_CARD_WIDTH);
  return Math.min(Math.floor((containerWidth - GAP) / 2.3), MAX_CARD_WIDTH);
}

export function ProductCarousel({ products }: { products: Product[] }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(991);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollRight, setCanScrollRight] = useState(products.length > 1);
  const [snapCount, setSnapCount] = useState(products.length);

  const cardWidth = getCardWidth(containerWidth);
  const cardStep = cardWidth + GAP;
  const canScrollLeft = activeIndex > 0;

  const [selected, setSelected] = useState<Product | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const intendedIndex = useRef(0);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  // Measure container width immediately on mount
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
  }, []);

  // Track container width changes (sidebar open/close, window resize)
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-snap to current position when card size changes due to container resize
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const clampedIdx = Math.min(intendedIndex.current, products.length - 1);
    const targetScroll = Math.min(clampedIdx * cardStep, maxScroll);
    el.scrollTo({ left: targetScroll, behavior: "instant" });
    setCanScrollRight(targetScroll < maxScroll - 8);
  }, [cardStep, products.length]);

  const updateScrollState = useCallback(() => {
    if (isProgrammaticScroll.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    // Snap count = how many distinct scroll positions exist
    const count = Math.min(Math.round(maxScroll / cardStep) + 1, products.length);
    setSnapCount(count);
    const idx = Math.max(0, Math.min(Math.round(el.scrollLeft / cardStep), products.length - 1));
    intendedIndex.current = idx;
    setActiveIndex(idx);
    setCanScrollRight(el.scrollLeft < maxScroll - 8);
  }, [cardStep, products.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollState);
  }, [updateScrollState]);

  function scrollToIndex(index: number) {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const clamped = Math.max(0, Math.min(index, products.length - 1));
    const targetScroll = Math.min(clamped * cardStep, maxScroll);

    intendedIndex.current = clamped;
    setActiveIndex(clamped);
    setCanScrollRight(targetScroll < maxScroll - 8);

    isProgrammaticScroll.current = true;
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    programmaticScrollTimer.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
      if (el) setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
    }, 500);

    el.scrollTo({ left: targetScroll, behavior: "smooth" });
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") return;
    isDragging.current = true;
    hasDragged.current = false;
    dragStartX.current = e.clientX;
    dragScrollLeft.current = scrollRef.current?.scrollLeft ?? 0;
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
      const nearest = Math.round(scrollRef.current.scrollLeft / cardStep);
      scrollToIndex(Math.max(0, Math.min(nearest, products.length - 1)));
    }
  }

  return (
    <div ref={outerRef} className="relative w-full max-w-[991px]">
      <div
        className="relative overflow-hidden"
        style={{
          maskImage:
            canScrollLeft && canScrollRight
              ? "linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)"
              : canScrollLeft
                ? "linear-gradient(to right, transparent 0%, black 4%, black 100%)"
                : canScrollRight
                  ? "linear-gradient(to right, black 0%, black 96%, transparent 100%)"
                  : "none",
          WebkitMaskImage:
            canScrollLeft && canScrollRight
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
          className="flex overflow-x-auto pb-2"
          style={{
            gap: GAP,
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
          {products.map((product) => (
            <div
              key={product.id}
              style={{
                scrollSnapAlign: "start",
                width: cardWidth,
                flexShrink: 0,
              }}
            >
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
        </div>
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollToIndex(activeIndex - 1)}
          aria-label="Previous product"
          className="absolute left-1 top-[100px] z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background text-foreground shadow-md transition-colors hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollToIndex(activeIndex + 1)}
          aria-label="Next product"
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
                dotIndex === activeIndex
                  ? "w-4 bg-foreground"
                  : "w-2 bg-muted-foreground/40",
              )}
            />
          ))}
        </div>
      )}

      <ProductDetailSheet
        product={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
