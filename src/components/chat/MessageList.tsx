import { useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "./MessageBubble";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";
import type { ChatStatus } from "ai";

export function MessageList({
  messages,
  status,
  stopped,
  timestamps,
  onSuggestionClick,
  onToolApprove,
  onRegenerate,
}: {
  messages: ChatUIMessage[];
  status?: ChatStatus;
  stopped?: boolean;
  timestamps?: Record<string, number>;
  onSuggestionClick?: (text: string) => void;
  onToolApprove?: (id: string, approved: boolean) => void;
  onRegenerate?: (messageId?: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const isNearBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
    if (!didInitialScrollRef.current || isNearBottom) {
      didInitialScrollRef.current = true;
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, status]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function handleScroll() {
      if (!viewport) return;
      const isNearBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    }

    viewport.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  const lastMessage = messages[messages.length - 1];
  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <div className="relative h-full min-h-0">
      <ScrollArea className="h-full" role="log" aria-live="polite">
        <div
          ref={(el) => {
            // ScrollArea renders a single viewport child; grab it for scroll tracking.
            viewportRef.current = el?.closest('[data-slot="scroll-area-viewport"]') ?? null;
          }}
          className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6"
        >
          {messages.map((message, i) => (
            <MessageBubble
              key={message.id || i}
              message={message}
              timestamp={timestamps?.[message.id]}
              streaming={isStreaming && i === messages.length - 1}
              onSuggestionClick={onSuggestionClick}
              onToolApprove={onToolApprove}
              onRegenerate={onRegenerate}
            />
          ))}
          {status === "submitted" && lastMessage?.role !== "assistant" && (
            <div className="flex items-center gap-2 self-start rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
          {stopped && status === "ready" && lastMessage && (
            <div className="flex items-center gap-2 self-start rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <span>Stopped generating</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2"
                onClick={() =>
                  onRegenerate?.(lastMessage.role === "assistant" ? lastMessage.id : undefined)
                }
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      {showScrollButton && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-md"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
