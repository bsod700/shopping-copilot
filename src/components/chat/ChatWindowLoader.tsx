/**
 * @fileoverview Server component that parallel-fetches messages and starter prompts,
 * then renders `ChatWindow` with both as props.
 *
 * Rendered inside `<Suspense>` by the chat page, so the sidebar and page chrome are
 * visible immediately while this component awaits its two DB/disk reads. Both fetches
 * run in parallel via `Promise.all` — there's no ordering dependency between them.
 */
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
