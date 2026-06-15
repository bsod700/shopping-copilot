"use client";

import { useEffect, useRef, useState } from "react";
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
  const { messages, status, error, sendMessage, stop, regenerate, addToolApprovalResponse } =
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
  const [timestamps, setTimestamps] = useState<Record<string, number>>({});
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      setStopped(false);
    }
  }, [status]);

  function handleStop() {
    stop();
    setStopped(true);
  }

  useEffect(() => {
    setTimestamps((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const message of messages) {
        if (!(message.id in next)) {
          next[message.id] = message.metadata?.createdAt ?? Date.now();
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [messages]);

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

  return (
    <div className="flex h-full flex-col">
      <CartBar />
      <div className="max-w-3xl mx-auto w-full h-full flex flex-col">
        <div className="overflow-hidden">
          <MessageList
            messages={messages}
            status={status}
            stopped={stopped}
            timestamps={timestamps}
            onSuggestionClick={(text) => sendMessage({ text })}
            onToolApprove={(id, approved) => addToolApprovalResponse({ id, approved })}
            onRegenerate={(messageId) => regenerate(messageId ? { messageId } : undefined)}
          />
        </div>
        {error && (
          <div className="flex items-center justify-between gap-2 border-t bg-destructive/10 px-4 py-2 text-sm text-destructive ">
            <span>Something went wrong, try again.</span>
            <Button size="sm" variant="outline" onClick={() => regenerate()}>
              Retry
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <StarterPrompts prompts={starterPrompts} onSelect={(text) => sendMessage({ text })} />
        )}
        <ChatInput
          status={status}
          onStop={handleStop}
          onSubmit={(text) => sendMessage({ text })}
        />
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
