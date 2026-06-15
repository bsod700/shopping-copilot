"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatStatus } from "ai";

export function ChatInput({
  status,
  onSubmit,
  onStop,
}: {
  status: ChatStatus;
  onSubmit: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || isStreaming) return;
    onSubmit(text);
    setText("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm"
    >
      <Textarea
        ref={textareaRef}
        data-testid="chat-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="How can I help?"
        disabled={isStreaming}
        aria-label="Chat message"
        rows={1}
        className="max-h-[200px] min-h-10 py-2 text-base"
      />
      {isStreaming ? (
        <Button
          type="button"
          size="icon"
          className="size-10 shrink-0 rounded-full"
          onClick={onStop}
          aria-label="Stop generating"
        >
          <Square className="size-4 fill-current" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          className="size-10 shrink-0 rounded-full"
          disabled={!text.trim()}
          aria-label="Send message"
        >
          <ArrowUp className="size-5" />
        </Button>
      )}
    </form>
  );
}
