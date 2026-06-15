"use client";

import { Button } from "@/components/ui/button";

export function StarterPrompts({
  prompts,
  onSelect,
}: {
  prompts: string[];
  onSelect: (text: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {prompts.map((prompt) => (
        <Button
          key={prompt}
          variant="outline"
          className="h-auto min-h-9 justify-start whitespace-normal rounded-full px-4 py-2 text-left text-sm leading-snug"
          onClick={() => onSelect(prompt)}
        >
          {prompt}
        </Button>
      ))}
    </div>
  );
}
