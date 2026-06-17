/**
 * @fileoverview Root route — redirects to an active (or newly created) empty conversation.
 *
 * Visiting `/` always drops the user into a conversation immediately rather than
 * showing a "start a new chat" landing page. `findOrCreateEmptyConversation` reuses
 * an existing untitled empty conversation if one exists, preventing accumulation of
 * stale empty rows when the user refreshes or closes and re-opens the app.
 */
import { redirect } from "next/navigation";
import { findOrCreateEmptyConversation } from "@/lib/persistence";

export default async function Home() {
  const conversation = await findOrCreateEmptyConversation();
  redirect(`/chat/${conversation.id}`);
}
