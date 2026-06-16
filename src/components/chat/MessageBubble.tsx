import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProductResults } from "./ProductResults";
import { ThinkingSteps } from "./ThinkingSteps";
import { cn } from "@/lib/utils";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";

export function MessageBubble({
  message,
  timestamp,
  streaming,
  onSuggestionClick,
  onToolApprove,
  onRegenerate,
}: {
  message: ChatUIMessage;
  timestamp?: number;
  streaming?: boolean;
  onSuggestionClick?: (text: string) => void;
  onToolApprove?: (id: string, approved: boolean) => void;
  onRegenerate?: (messageId: string) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [localTimestamp] = useState(() => Date.now());
  const displayTimestamp = timestamp ?? localTimestamp;

  function handleCopy() {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        isUser ? "items-end" : "items-start",
      )}
    >
      <ThinkingSteps parts={message.parts} streaming={!!streaming} />
      {message.parts.filter((part, i, arr) => {
        // Drop duplicate adjacent text parts (AI SDK can emit the same text
        // in a new step after a tool call, producing a visual double-render).
        if (part.type !== "text") return true;
        const prev = arr.slice(0, i).findLast((p) => p.type === "text");
        return !prev || prev.text !== part.text;
      }).map((part, i) => {
        switch (part.type) {
          // Rendered last, after the loop, regardless of generation order.
          case "tool-suggestFollowUps":
            return null;

          case "text":
            return (
              <div
                key={i}
                className={cn(
                  "max-w-2xl text-base leading-relaxed",
                  isUser
                    ? "rounded-2xl bg-[#111111] px-4 py-2.5 font-medium text-white dark:bg-white dark:text-[#111111]"
                    : "prose dark:prose-invert",
                )}
              >
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );

          case "tool-searchProducts":
            if (part.state === "output-available") {
              return <ProductResults key={i} products={part.output.products} />;
            }
            return (
              <div key={i} className="flex gap-4 overflow-hidden max-w-[991px]">
                <div className="w-2 shrink-0" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-[280px] w-[200px] shrink-0" />
                ))}
              </div>
            );

          case "tool-getProduct":
          case "tool-listCategories":
            if (part.state === "output-available") {
              return null;
            }
            return <Skeleton key={i} className="h-6 w-40" />;

          case "tool-addToCart":
            switch (part.state) {
              case "approval-requested":
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                    <span>
                      Add <strong>{part.input.title}</strong> (x{part.input.quantity ?? 1}) — $
                      {part.input.price} to your cart?
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => onToolApprove?.(part.approval.id, true)}>
                        Add to cart
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onToolApprove?.(part.approval.id, false)}
                      >
                        No thanks
                      </Button>
                    </div>
                  </div>
                );
              case "output-available":
                return (
                  <div key={i} className="rounded-lg border p-3 text-sm text-muted-foreground">
                    Added <strong>{part.output.title}</strong> to your cart.
                  </div>
                );
              case "output-denied":
                return (
                  <div key={i} className="rounded-lg border p-3 text-sm text-muted-foreground">
                    Okay, not added to cart.
                  </div>
                );
              default:
                return null;
            }

          case "tool-checkout":
            switch (part.state) {
              case "approval-requested":
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                    <span>Place this demo order now?</span>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => onToolApprove?.(part.approval.id, true)}>
                        Place order
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onToolApprove?.(part.approval.id, false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              case "output-available":
                return (
                  <div key={i} className="rounded-lg border p-3 text-sm">
                    Order placed! Demo order id: <strong>{part.output.orderId}</strong>
                  </div>
                );
              case "output-denied":
                return (
                  <div key={i} className="rounded-lg border p-3 text-sm text-muted-foreground">
                    Order cancelled.
                  </div>
                );
              default:
                return null;
            }

          case "step-start":
          case "reasoning":
            return null;

          default:
            return null;
        }
      })}

      {message.parts.map((part, i) => {
        if (part.type !== "tool-suggestFollowUps" || !part.input?.suggestions) {
          return null;
        }
        const suggestions = part.input.suggestions.flatMap((s) => (s ? [s] : []));
        return (
          <div key={i} className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                onClick={() => onSuggestionClick?.(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        );
      })}

      <div className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
        {displayTimestamp && (
          <span>
            {new Date(displayTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        {!isUser && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopy}
              aria-label="Copy message"
            >
              <Copy className={cn("h-3 w-3", copied && "text-green-500")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onRegenerate?.(message.id)}
              aria-label="Regenerate response"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
