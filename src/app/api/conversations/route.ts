/**
 * @fileoverview Conversations collection REST endpoint.
 *
 * GET  /api/conversations — return all conversations (id, title, updatedAt) for sidebar rendering.
 * POST /api/conversations — create a new empty conversation, return its id.
 *
 * The POST path is used by the sidebar "New chat" button. The GET path is called
 * server-side in the chat page layout to pre-populate the sidebar without a client fetch.
 */
import { listConversations, createConversation } from "@/lib/persistence";

export async function GET() {
  const conversations = await listConversations();
  return Response.json(conversations);
}

export async function POST() {
  const conversation = await createConversation();
  return Response.json({ id: conversation.id });
}
