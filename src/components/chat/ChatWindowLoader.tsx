import { ChatWindow } from "@/components/chat/ChatWindow";
import { getStarterPrompts } from "@/lib/starterPrompts";
import { loadMessages } from "@/lib/persistence";

export async function ChatWindowLoader({ conversationId }: { conversationId: string }) {
  const [initialMessages, starterPrompts] = await Promise.all([
    loadMessages(conversationId),
    getStarterPrompts(),
  ]);

  return (
    <ChatWindow
      conversationId={conversationId}
      initialMessages={initialMessages}
      starterPrompts={starterPrompts}
    />
  );
}
