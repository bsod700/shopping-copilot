/**
 * @fileoverview Single-conversation REST endpoint.
 *
 * GET    /api/conversations/[id] — load all persisted messages for a conversation.
 *                                  Called client-side by `ChatWindowLoader` on mount.
 * DELETE /api/conversations/[id] — delete the conversation and its messages (cascade).
 *                                  Called by `ConversationListItem` delete button.
 *
 * Note: `params` is a Promise in Next.js 16 App Router — it must be awaited before use.
 */
import { loadMessages, deleteConversation } from "@/lib/persistence";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const messages = await loadMessages(id);
  return Response.json(messages);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteConversation(id);
  return Response.json({ ok: true });
}
