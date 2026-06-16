"use client";

import { CheckCircle2 } from "lucide-react";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";

type StepPart = ChatUIMessage["parts"][number];

const STEP_LABELS: Record<string, string> = {
  "tool-searchProducts": "Searching for products",
  "tool-getProduct": "Getting product details",
  "tool-listCategories": "Listing categories",
  "tool-addToCart": "Adding to cart",
  "tool-checkout": "Processing checkout",
  reasoning: "Thinking",
};

function isStepPart(part: StepPart) {
  return part.type in STEP_LABELS;
}

function isStepDone(part: StepPart) {
  if (part.type === "reasoning") return "state" in part && part.state !== "streaming";
  return "state" in part && (part.state === "output-available" || part.state === "output-denied");
}

function getCompletionText(steps: StepPart[]): string {
  const hasSearch = steps.some((s) => s.type === "tool-searchProducts");
  return hasSearch ? "Found products worth seeing" : "Response ready";
}

function getCurrentStepLabel(steps: StepPart[]): string | null {
  const active = [...steps].reverse().find((s) => !isStepDone(s));
  return active ? (STEP_LABELS[active.type] ?? null) : null;
}

export function ThinkingSteps({ parts }: { parts: StepPart[]; streaming: boolean }) {
  const steps = parts.filter(isStepPart);
  if (steps.length === 0) return null;

  const allDone = steps.every(isStepDone);
  const currentStepLabel = allDone ? null : getCurrentStepLabel(steps);
  const headerText = allDone ? getCompletionText(steps) : "Thinking...";

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
        <span>{headerText}</span>
      </div>
      {!allDone && currentStepLabel && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
            <span className="block h-1.5 w-1.5 rounded-full bg-foreground" />
          </span>
          <span>{currentStepLabel}</span>
        </div>
      )}
    </div>
  );
}
