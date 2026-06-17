/**
 * @fileoverview Single conversation row in the sidebar list.
 *
 * Shows a link to the conversation. A trash icon appears on hover (or focus)
 * and opens an `AlertDialog` confirmation before deleting. After deletion:
 * - If this was the active conversation: redirects to `/` (which creates a fresh one)
 * - Otherwise: calls `router.refresh()` to re-fetch the sidebar list server-side
 *
 * `data-testid="conversation-item"` is used by Playwright E2E tests.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function ConversationListItem({
  conversation,
  isActive,
}: {
  conversation: { id: string; title: string };
  isActive: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    setOpen(false);
    if (isActive) {
      router.push("/");
    } else {
      router.refresh();
    }
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
      data-testid="conversation-item"
    >
      <Link
        href={`/chat/${conversation.id}`}
        className="flex-1 truncate rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {conversation.title}
      </Link>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Delete conversation"
            >
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
