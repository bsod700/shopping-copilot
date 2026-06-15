import { db } from "@/lib/db";
import type { ChatUIMessage } from "@/lib/ai/uiMessage";

export async function listConversations() {
  return db.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function createConversation() {
  return db.conversation.create({ data: {} });
}

export async function findOrCreateEmptyConversation() {
  const existing = await db.conversation.findFirst({
    where: { title: "New conversation", messages: { none: {} } },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;
  return db.conversation.create({ data: {} });
}

export async function deleteConversation(id: string) {
  await db.conversation.delete({ where: { id } });
}

export async function getConversation(id: string) {
  return db.conversation.findUnique({ where: { id } });
}

export async function updateConversationTitle(id: string, title: string) {
  await db.conversation.update({ where: { id }, data: { title } });
}

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
