"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";

type Part = ChatUIMessage["parts"][number];

const TOOL_TYPES = new Set([
  "tool-searchProducts",
  "tool-sortShownProducts",
  "tool-getBestRated",
  "tool-getProduct",
  "tool-listCategories",
  "tool-suggestFollowUps",
  "tool-addToCart",
  "tool-checkout",
  "reasoning",
]);

function isStepPart(part: Part) {
  return TOOL_TYPES.has(part.type);
}

function isDone(part: Part) {
  if (part.type === "reasoning") return "state" in part && part.state !== "streaming";
  return "state" in part && (part.state === "output-available" || part.state === "output-denied");
}

/** Derive a human-readable label from the tool type + its input params. */
function stepLabel(part: Part): string | null {
  const input = "input" in part ? (part.input as Record<string, unknown>) : null;
  const done = isDone(part);

  switch (part.type) {
    case "reasoning":
      return done ? "Thought it through" : "Thinking…";

    case "tool-searchProducts": {
      if (!input) return done ? "Searched products" : "Searching…";
      const { category, query, rankBy, sortBy } = input as {
        category?: string;
        query?: string;
        rankBy?: string;
        sortBy?: string;
      };
      if (rankBy === "biggestDiscount") return done ? "Found biggest discounts" : "Finding biggest discounts…";
      if (rankBy === "discountedBestRated") return done ? "Found best-rated sale items" : "Finding best-rated sale items…";
      if (rankBy === "budgetBestRated") return done ? "Found best value items" : "Finding best value items…";
      const subject = category ?? query ?? "products";
      if (sortBy) return done ? `Found ${subject} (sorted by ${sortBy})` : `Searching ${subject}…`;
      return done ? `Found ${subject}` : `Searching ${subject}…`;
    }

    case "tool-getBestRated":
      return done ? "Found best-rated products" : "Filtering best-rated…";

    case "tool-sortShownProducts": {
      if (!input) return done ? "Sorted results" : "Sorting…";
      const { sortBy, order } = input as { sortBy?: string; order?: string };
      const dir = order === "asc" ? "low → high" : order === "desc" ? "high → low" : "";
      const field = sortBy === "discountPercentage" ? "discount" : sortBy ?? "";
      return done
        ? `Sorted by ${field}${dir ? ` (${dir})` : ""}`
        : `Sorting by ${field}…`;
    }

    case "tool-getProduct":
      return done ? "Got product details" : "Getting product details…";

    case "tool-listCategories":
      return done ? "Listed categories" : "Listing categories…";

    case "tool-addToCart":
      return done ? "Added to cart" : "Adding to cart…";

    case "tool-checkout":
      return done ? "Order placed" : "Processing checkout…";

    case "tool-suggestFollowUps":
      return null; // internal tool, don't surface

    default:
      return null;
  }
}

export function ThinkingSteps({ parts }: { parts: Part[]; streaming: boolean }) {
  const steps = parts.filter(isStepPart);
  if (steps.length === 0) return null;

  const allDone = steps.every(isDone);
  const visibleSteps = steps.filter((s) => stepLabel(s) !== null);
  if (visibleSteps.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      {visibleSteps.map((step, i) => {
        const done = isDone(step);
        const label = stepLabel(step);
        return (
          <div key={i} className="flex items-center gap-2">
            {done ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            )}
            <span className={done && !allDone ? "opacity-50" : undefined}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
