"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { Button } from "@/components/ui/button";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { StarterPrompts } from "./StarterPrompts";
import { CartProvider, useCart } from "./CartContext";
import { CartBar } from "./CartBar";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";

function ChatWindowInner({
  conversationId,
  initialMessages,
  starterPrompts,
}: {
  conversationId: string;
  initialMessages: ChatUIMessage[];
  starterPrompts: string[];
}) {
  const router = useRouter();
  const { messages, status, error, sendMessage, stop, regenerate, clearError, addToolApprovalResponse } =
    useChat<ChatUIMessage>({
      id: conversationId,
      messages: initialMessages,
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: { conversationId },
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onFinish: () => {
        // Title is generated server-side after the first message; give it a
        // moment to land before refreshing the sidebar's conversation list.
        setTimeout(() => router.refresh(), 1000);
      },
  });
  const { addItem, clear } = useCart();
  const handledToolCallIds = useRef(new Set<string>());
  const [stopped, setStopped] = useState(false);

  function handleStop() {
    stop();
    clearError();
    setStopped(true);
  }

  function handleSubmit(text: string) {
    setStopped(false);
    clearError();
    sendMessage({ text });
  }

  function handleRegenerate(messageId?: string) {
    clearError();
    regenerate(messageId ? { messageId } : undefined);
  }

  const timestamps = useMemo(
    () =>
      Object.fromEntries(
        messages.flatMap((message) =>
          message.metadata?.createdAt ? [[message.id, message.metadata.createdAt]] : [],
        ),
      ),
    [messages],
  );

  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "tool-addToCart" && part.state === "output-available") {
          if (handledToolCallIds.current.has(part.toolCallId)) continue;
          handledToolCallIds.current.add(part.toolCallId);
          const { productId, title, price, quantity } = part.output;
          addItem({ productId, title, price, quantity });
        }
        if (part.type === "tool-checkout" && part.state === "output-available") {
          if (handledToolCallIds.current.has(part.toolCallId)) continue;
          handledToolCallIds.current.add(part.toolCallId);
          clear();
        }
      }
    }
  }, [messages, addItem, clear]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <CartBar />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          {hasMessages ? (
            <MessageList
              messages={messages}
              status={status}
              stopped={stopped && status === "ready"}
              timestamps={timestamps}
              onSuggestionClick={handleSubmit}
              onToolApprove={(id, approved) => addToolApprovalResponse({ id, approved })}
              onRegenerate={handleRegenerate}
            />
          ) : (
            <div className="h-full" aria-hidden="true" />
          )}
        </div>
        <div className="shrink-0 border-t bg-background/95 px-4 pb-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {error && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <span>Something went wrong, try again.</span>
                <Button size="sm" variant="outline" onClick={() => handleRegenerate()}>
                  Retry
                </Button>
              </div>
            )}
            {!hasMessages && (
              <StarterPrompts prompts={starterPrompts} onSelect={handleSubmit} />
            )}
            <ChatInput
              status={status}
              onStop={handleStop}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatWindow({
  conversationId,
  initialMessages,
  starterPrompts,
}: {
  conversationId: string;
  initialMessages: ChatUIMessage[];
  starterPrompts: string[];
}) {
  return (
    <CartProvider>
      <ChatWindowInner
        conversationId={conversationId}
        initialMessages={initialMessages}
        starterPrompts={starterPrompts}
      />
    </CartProvider>
  );
}
