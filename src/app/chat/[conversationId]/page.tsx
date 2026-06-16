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
      <div className="mx-auto flex h-full w-full flex-1 flex-col">
        <Suspense fallback={<ChatWindowSkeleton />}>
          <ChatWindowLoader conversationId={conversationId} />
        </Suspense>
      </div>
    </div>
  );
}
