"use client";

import { useRouter } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ConversationListItem } from "./ConversationListItem";
import { ThemeToggle } from "./ThemeToggle";

interface ConversationSummary {
  id: string;
  title: string;
}

function SidebarContent({
  conversations,
  activeId,
  onNewConversation,
}: {
  conversations: ConversationSummary[];
  activeId: string;
  onNewConversation: () => void;
}) {
  return (
    <div className="sidebar-group flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 p-3">
        <Button
          className="flex-1 justify-start gap-2"
          variant="outline"
          onClick={onNewConversation}
          data-testid="new-conversation"
        >
          <Plus className="size-4" />
          New chat
        </Button>
        <ThemeToggle />
      </div>
      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1 p-2">
          {conversations.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              isActive={conversation.id === activeId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ConversationSidebar({
  conversations,
  activeId,
}: {
  conversations: ConversationSummary[];
  activeId: string;
}) {
  const router = useRouter();

  async function handleNewConversation() {
    const res = await fetch("/api/conversations", { method: "POST" });
    const { id } = await res.json();
    router.push(`/chat/${id}`);
  }

  return (
    <>
      <aside className="hidden h-full w-64 shrink-0 border-r bg-muted/30 min-[1300px]:block">
        <SidebarContent
          conversations={conversations}
          activeId={activeId}
          onNewConversation={handleNewConversation}
        />
      </aside>

      <Sheet>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 left-2 z-10 min-[1300px]:hidden"
              aria-label="Open conversations"
            >
              <Menu className="size-4" />
            </Button>
          }
        />
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Conversations</SheetTitle>
          </SheetHeader>
          <SidebarContent
            conversations={conversations}
            activeId={activeId}
            onNewConversation={handleNewConversation}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
