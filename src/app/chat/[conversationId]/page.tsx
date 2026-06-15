import { notFound } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ConversationSidebar } from "@/components/sidebar/ConversationSidebar";
import { getStarterPrompts } from "@/lib/starterPrompts";
import { getConversation, listConversations, loadMessages } from "@/lib/persistence";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const conversation = await getConversation(conversationId);
  if (!conversation) notFound();

  const [conversations, initialMessages, starterPrompts] = await Promise.all([
    listConversations(),
    loadMessages(conversationId),
    getStarterPrompts(),
  ]);

  return (
    <div className="flex h-screen">
      <ConversationSidebar conversations={conversations} activeId={conversationId} />
      <div className="mx-auto flex h-full w-full flex-1 flex-col">
        <ChatWindow
          conversationId={conversationId}
          initialMessages={initialMessages}
          starterPrompts={starterPrompts}
        />
      </div>
    </div>
  );
}
