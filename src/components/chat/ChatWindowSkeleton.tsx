/**
 * @fileoverview Skeleton placeholder shown by `<Suspense>` while `ChatWindowLoader`
 * is fetching initial messages and starter prompts server-side. Mirrors the rough
 * layout of the chat window (message bubbles + input bar) to prevent layout shift.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function ChatWindowSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex-1 space-y-3">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-10 w-1/2" />
        <Skeleton className="h-24 w-3/4" />
      </div>
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
