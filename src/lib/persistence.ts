/**
 * @fileoverview SQLite persistence layer for conversations and messages.
 *
 * Messages are stored as serialized JSON (the full `ChatUIMessage` blob) so the
 * AI SDK's rich part structure (text parts, tool-call parts, tool-result parts,
 * reasoning parts, etc.) is preserved without a complex relational schema.
 *
 * `loadMessages` re-injects `createdAt` from the DB row's timestamp so the UI
 * can render per-message timestamps even though that field isn't part of the
 * serialized message itself.
 *
 * `saveMessages` uses a delete-then-recreate transaction rather than an upsert
 * because the AI SDK may mutate part IDs between streaming and the final save —
 * a simple upsert would leave orphaned parts or conflict on primary keys.
 */
import { db } from "@/lib/db";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";

/** Return all conversations ordered newest first. Used to populate the sidebar. */
export async function listConversations() {
  return db.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
}

/** Create a new empty conversation with the default title "New conversation". */
export async function createConversation() {
  return db.conversation.create({ data: {} });
}

/**
 * Return an existing untitled empty conversation, or create one if none exists.
 *
 * Prevents accumulating stale empty conversations when the user navigates to `/`
 * repeatedly without sending a message. Only reuses a conversation that still has
 * the default title AND no messages — a renamed or populated conversation is never reused.
 */
export async function findOrCreateEmptyConversation() {
  const existing = await db.conversation.findFirst({
    where: { title: "New conversation", messages: { none: {} } },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;
  return db.conversation.create({ data: {} });
}

/**
 * Delete a conversation and all its messages (cascaded by the DB schema).
 * Used by the delete button in the sidebar; the UI immediately redirects to `/`.
 */
export async function deleteConversation(id: string) {
  await db.conversation.delete({ where: { id } });
}

/** Fetch a single conversation by id. Returns `null` if not found. */
export async function getConversation(id: string) {
  return db.conversation.findUnique({ where: { id } });
}

/**
 * Overwrite the conversation title.
 *
 * Called fire-and-forget from the chat route after the first user message to
 * replace "New conversation" with a 4-6 word AI-generated summary.
 */
export async function updateConversationTitle(id: string, title: string) {
  await db.conversation.update({ where: { id }, data: { title } });
}

/**
 * Load all messages for a conversation in chronological order.
 *
 * Each DB row stores the full `ChatUIMessage` as JSON. On load, `createdAt` from
 * the row timestamp is injected into `message.metadata` so the chat UI can display
 * per-message timestamps without storing them inside the serialized message blob.
 */
export async function loadMessages(conversationId: string): Promise<ChatUIMessage[]> {
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => {
    const message = JSON.parse(row.content) as ChatUIMessage;
    return { ...message, metadata: { ...message.metadata, createdAt: row.createdAt.getTime() } };
  });
}

/**
 * Persist the current message list for a conversation.
 *
 * Runs as a transaction: delete all existing messages, recreate them from the
 * current list, and touch `updatedAt` on the conversation so the sidebar re-sorts.
 * The delete-then-recreate pattern avoids primary-key conflicts from AI SDK part IDs
 * that may change between streaming and the final `onFinish` callback.
 */
export async function saveMessages(conversationId: string, messages: ChatUIMessage[]) {
  await db.$transaction([
    db.message.deleteMany({ where: { conversationId } }),
    db.message.createMany({
      data: messages.map((message) => ({
        conversationId,
        role: message.role,
        content: JSON.stringify(message),
      })),
    }),
    db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ]);
}
