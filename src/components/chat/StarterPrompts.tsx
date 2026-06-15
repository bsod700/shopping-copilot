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
    <div className="grid grid-cols-2 gap-2 p-4">
      {prompts.map((prompt) => (
        <Button
          key={prompt}
          variant="outline"
          className="h-auto justify-start whitespace-normal text-left text-sm"
          onClick={() => onSelect(prompt)}
        >
          {prompt}
        </Button>
      ))}
    </div>
  );
}
