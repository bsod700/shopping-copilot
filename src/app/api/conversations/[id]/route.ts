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
