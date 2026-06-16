# Handoff

## Session: Responsive layout, UX fixes, welcome state (2026-06-16)

### What was done

#### Bug: "No matching products" for "show me all men's shirts"
AI was calling `searchProducts({ category: "mens-shirts", minRating: 4 })` which
eliminated all 5 shirts (none have rating >= 4). Fixed with two layers:
- **[src/lib/ai/systemPrompt.ts](src/lib/ai/systemPrompt.ts)** - added `SHOW ALL RULE`:
  when user says "show all"/"show me all"/"list all", call searchProducts with ONLY
  category + limit:20. No minRating, no inStock, no rankBy, no sortBy. Do not mention
  filtering, do not suggest "without filters".
- **[src/lib/ai/tools.ts](src/lib/ai/tools.ts)** - framework-level enforcement in `execute()`:
  when `limit === 20`, strip rankBy/minRating/inStock/sortBy/order unconditionally,
  regardless of what the LLM passed.

#### Bug: Duplicate AI response text
Vercel AI SDK re-emits the same text part in a new step after each tool call, causing
the same paragraph to render twice.
- **[src/components/chat/MessageBubble.tsx](src/components/chat/MessageBubble.tsx)** -
  deduplicate consecutive identical text parts in the `.filter()` before `.map()`.

#### Bug: "Show all men's shirts without filters" suggestion
AI was suggesting this because it knew it had applied a filter. Covered by the
`SHOW ALL RULE` in systemPrompt.ts above.

#### Chat content width: 768px -> 991px
- **[src/components/chat/MessageList.tsx](src/components/chat/MessageList.tsx)** - `max-w-3xl` -> `max-w-[991px]`
- **[src/components/chat/ChatWindow.tsx](src/components/chat/ChatWindow.tsx)** - input wrapper same change
- **[src/components/chat/ProductCarousel.tsx](src/components/chat/ProductCarousel.tsx)** - carousel container same change
- **[src/components/chat/MessageBubble.tsx](src/components/chat/MessageBubble.tsx)** - skeleton same change

#### Responsive layout fix
Sidebar (256px) + content (991px) = 1247px total. Below 1300px the browser was
zooming out the whole page instead of being responsive.
- **[src/components/sidebar/ConversationSidebar.tsx](src/components/sidebar/ConversationSidebar.tsx)** -
  sidebar `aside` changed from `sm:block` to `min-[1300px]:block`. Hamburger drawer
  trigger changed from `sm:hidden` to `min-[1300px]:hidden`.
- Result: below 1300px the sidebar collapses to a drawer (hamburger top-left),
  content fills full width. At 1300px+ sidebar is persistent alongside 991px content.

#### Welcome empty state
- **[src/components/chat/ChatWindow.tsx](src/components/chat/ChatWindow.tsx)** - replaced blank
  `<div className="h-full">` with a centered welcome section: shopping bag emoji,
  "Hey, I'm your shopping assistant!" heading, and a short subtitle with emojis.

#### Starter prompts: icons + spacing + new first prompt
- **[src/lib/starterPrompts.ts](src/lib/starterPrompts.ts)** - replaced "What's trending in
  fragrances?" with "What's popular right now?"
- **[src/components/chat/StarterPrompts.tsx](src/components/chat/StarterPrompts.tsx)** - added
  lucide icons as prefix (TrendingUp, Laptop, Shirt, Glasses), increased gap from 2 to 3,
  taller buttons (min-h-12), rounded-2xl corners.

### Verified
All changes tested in preview at 1000px and 1400px. Shirts show correctly. Welcome
state renders on new conversation. Starter prompts show icons and spacing.

### Not done / still pending
- Clean up test-artifact conversations in `dev.db` from browser verification sessions.
- Flaky eval: `follow-up-suggestions` intermittently fails (pre-existing, not caused
  here - model occasionally skips `suggestFollowUps` after a `budgetBestRated` search).

### Previous session context
See git log for the dress filtering fix (2026-06-15) which introduced
`createSearchProductsTool(conversationId)` factory and per-conversation shown-IDs tracking.
