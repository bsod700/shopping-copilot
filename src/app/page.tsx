import { redirect } from "next/navigation";
import { findOrCreateEmptyConversation } from "@/lib/persistence";

export default async function Home() {
  const conversation = await findOrCreateEmptyConversation();
  redirect(`/chat/${conversation.id}`);
}
