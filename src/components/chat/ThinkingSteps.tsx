"use client";

import { useState, type ComponentType } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Package,
  ListTree,
  ShoppingCart,
  CreditCard,
  Brain,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";

type StepPart = ChatUIMessage["parts"][number];

const STEP_CONFIG: Record<string, { icon: ComponentType<{ className?: string }>; label: string }> = {
  "tool-searchProducts": { icon: Search, label: "Searching products" },
  "tool-getProduct": { icon: Package, label: "Getting product details" },
  "tool-listCategories": { icon: ListTree, label: "Listing categories" },
  "tool-addToCart": { icon: ShoppingCart, label: "Adding to cart" },
  "tool-checkout": { icon: CreditCard, label: "Processing checkout" },
  reasoning: { icon: Brain, label: "Thinking" },
};

function isStepPart(part: StepPart) {
  return part.type in STEP_CONFIG;
}

function isStepDone(part: StepPart) {
  if (part.type === "reasoning") return "state" in part && part.state !== "streaming";
  return "state" in part && (part.state === "output-available" || part.state === "output-denied");
}

export function ThinkingSteps({ parts, streaming }: { parts: StepPart[]; streaming: boolean }) {
  const steps = parts.filter(isStepPart);
  const [open, setOpen] = useState(streaming);

  if (steps.length === 0) return null;

  const allDone = steps.every(isStepDone);

  return (
    <div className="w-full max-w-2xl rounded-lg border bg-muted/40 text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {allDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        )}
        <span>{allDone ? "Response ready" : "Thinking..."}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 px-3 pb-3">
          {steps.map((part, i) => {
            const config = STEP_CONFIG[part.type];
            const Icon = config.icon;
            const done = isStepDone(part);
            return (
              <li key={i} className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                <span>{config.label}</span>
                {done ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
