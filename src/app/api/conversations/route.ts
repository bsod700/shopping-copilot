import { listConversations, createConversation } from "@/lib/persistence";

export async function GET() {
  const conversations = await listConversations();
  return Response.json(conversations);
}

export async function POST() {
  const conversation = await createConversation();
  return Response.json({ id: conversation.id });
}
