/**
 * @fileoverview Starter prompt chips shown on a fresh conversation before the user types.
 *
 * Each prompt is paired with a fixed Lucide icon (cycling via index if there are ever
 * more prompts than icons). Clicking a chip calls `onSelect` which submits the prompt
 * text directly — the user doesn't need to type anything.
 */
"use client";

import { TrendingUp, Laptop, Shirt, Glasses } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROMPT_ICONS = [TrendingUp, Laptop, Shirt, Glasses];

export function StarterPrompts({
  prompts,
  onSelect,
}: {
  prompts: string[];
  onSelect: (text: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {prompts.map((prompt, i) => {
        const Icon = PROMPT_ICONS[i % PROMPT_ICONS.length];
        return (
          <Button
            key={prompt}
            variant="outline"
            className="h-auto min-h-12 justify-start gap-3 whitespace-normal rounded-2xl px-4 py-3 text-left text-sm leading-snug"
            onClick={() => onSelect(prompt)}
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            {prompt}
          </Button>
        );
      })}
    </div>
  );
}
