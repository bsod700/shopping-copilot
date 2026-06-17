/**
 * @fileoverview Chat page — server component that validates the conversation and renders
 * the sidebar + chat window.
 *
 * Validation is done at the server level so an invalid or deleted conversationId
 * results in a proper 404 rather than a client-side error. Both `getConversation`
 * and `listConversations` run in parallel via Next.js server component concurrent
 * rendering — they're independent DB queries with no ordering dependency.
 *
 * The chat window is wrapped in `<Suspense>` so the sidebar and page chrome render
 * instantly while `ChatWindowLoader` fetches messages and starter prompts.
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChatWindowLoader } from "@/components/chat/ChatWindowLoader";
import { ChatWindowSkeleton } from "@/components/chat/ChatWindowSkeleton";
import { ConversationSidebar } from "@/components/sidebar/ConversationSidebar";
import { getConversation, listConversations } from "@/lib/persistence";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const conversation = await getConversation(conversationId);
  if (!conversation) notFound();

  const conversations = await listConversations();

  return (
    <div className="flex h-screen">
      <ConversationSidebar conversations={conversations} activeId={conversationId} />
      <main className="mx-auto flex h-full w-full flex-1 flex-col">
        <Suspense fallback={<ChatWindowSkeleton />}>
          <ChatWindowLoader conversationId={conversationId} />
        </Suspense>
      </main>
    </div>
  );
}
