# Bazak Shopping Copilot

An AI shopping assistant that helps users discover products through natural conversation. Built for the Bazak technical assignment.

---

## Setup & Run

**Requirements:** Node.js 20+, an OpenAI API key

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env
# Edit .env and fill in OPENAI_API_KEY and DATABASE_URL

# 3. Apply the database schema (creates dev.db)
npx prisma migrate deploy

# 4. Start the dev server
npm run dev
# → Open http://localhost:3000
```

---

## Architecture & Framework Choice

**Chosen: Vercel AI SDK v6**

I picked the Vercel AI SDK because it solves exactly the hard parts of this project — streaming UI, structured tool calls, human-in-the-loop approval, typed message parts — without adding orchestration overhead I don't need. The SDK's `useChat` hook on the client and `streamText` on the server handle the full request lifecycle. `InferUITools` gives type-safe tool output shapes so TypeScript catches mismatches at compile time. The `needsApproval: true` flag on add-to-cart and checkout gates those actions behind a UI confirm dialog with no extra wiring.

**Rejected: LangChain**

LangChain's value is chaining multiple steps, agents reasoning over tools in a loop, and connecting many data sources through standardized abstractions. None of that applies here: this is a single-model, single-thread, single-catalog app where every product query is one API call. LangChain would add 3-4 abstraction layers (chains, loaders, vectorstores, memory) to something that needs none of them. Its streaming story also requires bridging between LangChain's event system and a React hook — the AI SDK handles that natively. The weight of LangChain is a liability, not an asset, for this scope.

**Rejected: Mastra**

Mastra is a full agent framework with its own server runtime, workflow definitions, a built-in memory system, and deployment primitives. That's the right tool for a production multi-agent pipeline, but it would mean configuring a new runtime just to run a single conversation loop. The setup overhead (Mastra config, workflow definitions, running the Mastra server alongside Next.js) would have consumed most of the available time. I also wanted to own the persistence layer explicitly — so I could explain exactly where conversations live and why — rather than delegating it to Mastra's managed memory abstraction.

---

## Retrieval Strategy

### How the system decides what to query

The model receives a detailed system prompt that maps user intent to specific `searchProducts` tool parameters. The tool calls the DummyJSON API via one of three routes, selected in priority order:

1. **`category` set → `/products/category/{slug}`** — most precise for named categories (laptops, sunglasses, womens-dresses, etc.)
2. **`query` set → `/products/search?q=`** — free-text keyword match for product types with no category slug (blazer, frock, cardigan, etc.)
3. **Neither → `/products`** — full catalog browse, useful with sort params ("show me everything sorted by rating")

Sorting and filtering are always applied client-side after fetching the full pool from the API, because DummyJSON's server-side sort is unreliable on category endpoints.

### Which endpoints and parameters, and why

- `/products/category/{slug}`, `/products/search`, `/products` — the three browse paths covering every intent
- `/products/{id}` — detail fetch on demand, used only when the user asks a follow-up about a product already shown (avoids re-running a full search when the id is already known)
- `/products/category-list` — category slug lookup, cached 24h (static demo data, never changes)

Parameters used: `limit` (controls pool size — 0 = full pool for sorting, 1 for "cheapest single", 5 for browsing), `select` (reduces payload to the 11 fields actually displayed), `sortBy`/`order` (applied client-side for correctness after fetching the full pool).

Parameters NOT used: `minPrice`/`maxPrice` — the DummyJSON API does not support price range filtering. "Cheapest" requests are approximated with `sortBy: price, order: asc`, which is an intentional, documented trade-off.

### Ambiguous queries

- **"something cheap and cool"** → the model picks the nearest category (based on context or prior turn), sorts by price ascending, and tells the user what it searched for so they can redirect if wrong.
- **Vague taste words ("cool", "nice")** → model picks closest category + honest disclosure of what was searched.
- **"best value" / "budget option"** → `rankBy: budgetBestRated` which filters to products rated ≥4 then sorts cheapest first — both dimensions addressed.

### Off-catalog queries

The system prompt lists the 24 valid DummyJSON categories and instructs the model to tell the user politely that the shop doesn't carry that item rather than pretending to search. Travel, services, digital goods → no tool call, just a conversational explanation.

### Multi-intent queries

"Show me a laptop and some sunglasses" → the model calls `searchProducts` once per distinct ask and labels each result group in its reply.

---

## Conversation & State

**Persistence: SQLite via Prisma 7 with `@prisma/adapter-better-sqlite3`**

Each conversation is a row in the `Conversation` table. Messages are rows in the `Message` table, each storing the full `ChatUIMessage` blob as JSON. The full-blob approach avoids a complex relational schema for the AI SDK's rich part structure (text parts, tool-call parts, tool-result parts, reasoning parts, approval states) — a flat `content` column preserves all of it without any transformation logic.

Messages are saved atomically in a delete-then-recreate transaction: delete all rows for the conversation, recreate from the current message list, touch `updatedAt`. This avoids primary-key conflicts from AI SDK part IDs that may change between streaming and the final `onFinish` callback.

**Why SQLite and not:**
- **Redis** — requires a running server, adds operational complexity for a local-only app. Redis is correct for pub/sub or multi-instance sharing; neither applies here.
- **localStorage** — can't be read by server components (sidebar pre-population would require a client fetch round-trip), and a 5-10MB limit would be hit by long conversations with many tool results. SQLite has no meaningful size limit locally and can be queried server-side.
- **In-memory (no persistence)** — the assignment explicitly requires conversations to survive page refresh.

**Cart state** lives in `localStorage` only — it's transient session state in a demo with no real checkout, so server persistence would add complexity with no benefit.

**Failure modes:**
- **Storage full:** SQLite returns an I/O error on write. The chat route catches persistence errors inside `onFinish` and logs them without failing the response stream — the user sees their answer but it won't be saved. On reload, that turn is gone.
- **Corrupted DB file:** Prisma throws on connect and the app fails to start. Recovery: delete `dev.db` and re-run `prisma migrate deploy`. A production deployment would handle this with automated backups and replica failover.
- **User clears localStorage mid-conversation:** The cart empties but conversation history (in SQLite) is unaffected. The user loses only their cart.

---

## Evaluation

### What the test/eval suite covers

Three complementary layers:

**1. Unit tests (`__tests__/unit/`)**
- `dummyjson.test.ts` — mock-fetches the DummyJSON API and verifies the three routing paths (category, search, browse), client-side sorting, `budgetBestRated` ranking, the `limit=0` full-pool fetch used for ranking, and network error handling.
- `persistence.test.ts` — uses an in-memory SQLite adapter to verify the delete-then-recreate transaction, `loadMessages` createdAt injection, and `findOrCreateEmptyConversation` dedup logic.

**2. Integration tests (`__tests__/integration/`)**
- `chat-route.test.ts` — exercises the POST `/api/chat` handler with a mocked OpenAI response, verifying that messages are saved after a stream, title generation fires, and a model error returns a 500 with a user-friendly message.

**3. E2E tests (`__tests__/e2e/`, Playwright)**
- Happy path: type a message, assistant responds, product cards render (verified by `data-testid="product-card"`)
- New conversation: "New chat" button creates a conversation, URL changes to the new id
- Delete conversation: confirm dialog fires, sidebar item disappears, active deletion redirects to `/`
- Cart flow: approve/deny dialog for add-to-cart, cart count badge increments, checkout confirm

### What regressions these catch

- API routing bugs in `dummyjson.ts` (wrong endpoint, params in wrong slot)
- Persistence regressions (messages not saved, timestamps not injected, IDs lost)
- Tool execution failures breaking the stream response
- UI regressions in product card rendering, cart badge, conversation sidebar

### What would slip through

- **Model behavior regressions** — if a prompt change makes the model start using `query` alongside `category` (which silently breaks results at the API level), no test catches this without an LLM eval harness
- **DummyJSON API changes** — tests mock the API; breaking upstream changes only surface in production
- **Visual/layout regressions** — Playwright checks for element presence, not pixel correctness; a Chromatic or Percy integration would catch those
- **Carousel drag-to-scroll edge cases** — hard to exercise in Playwright without touch event simulation

---

## Known Limitations

### Where the system underperforms today

**No real price filtering.** DummyJSON has no `minPrice`/`maxPrice` parameter. "Laptops under $500" returns the cheapest laptops sorted ascending — not a filtered set. I note this in the response when relevant, but it's a genuine capability gap.

**Category + query can't be combined at the API level.** If a user asks "cheap Samsung phones", the system uses the `smartphones` category and applies "Samsung" as a client-side title/tag filter after fetching. If Samsung has no smartphones in the DummyJSON catalog, the result is empty with no graceful fallback.

**DummyJSON's search is substring-only.** `query:"perfume"` won't match products titled "Eau De Parfum". The system prompt teaches the model to use `category:"fragrances"` instead of a keyword query when the user's term maps to a known category — but novel synonym mismatches still produce zero results.

**In-memory state resets on server restart.** The per-conversation shown-IDs map (prevents repeated products on "show more") and the 5-minute tool result cache live in process memory. They reset on every dev server restart. Fine for a demo, but a production deployment would need Redis or a DB-backed cache.

**No streaming recovery.** If the connection drops mid-stream, the partial response is not saved — `onFinish` only fires on a clean completion. The user loses the partial turn on reload.

### What I'd change with another week

1. **LLM evals with a golden dataset.** A small set of (input → expected tool call → expected output shape) triples run against the live model, in CI, would catch prompt regressions before they reach users. Tools like Braintrust or promptfoo make this repeatable.

2. **Client-side price range filtering.** Since DummyJSON has no price filter, I'd fetch the full category pool (`limit:0`), filter client-side by the user's stated range, then paginate — giving users a genuine "under $X" experience.

3. **Synonym expansion.** A small static map (perfume → fragrances, cologne → fragrances, sneakers → mens-shoes, etc.) would prevent the model from ever guessing wrong on common synonym mismatches, without requiring an embedding-based search.

4. **Streaming persistence.** Save each streamed token as it arrives (or at minimum save a partial message on stream error) so interrupted responses aren't completely lost.

5. **Server-side cart.** Move cart state from localStorage to `Cart`/`CartItem` DB tables so multi-tab sessions share state and cart survives localStorage.clear().

---

## Lighthouse Scores

**Production build** (`npm run build && npm start`):

| Category | Score |
|---|---|
| Performance | 100 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

Key metrics (prod): FCP ~0.2 s · LCP ~0.6 s · TBT ~10 ms · CLS 0 · Speed Index ~0.4 s.

**Dev build** (`npm run dev`) scores ~64 in Performance and will always be lower — Next.js ships unminified JS in dev (~675 KiB unused + ~372 KiB unminified bundle). This is expected and does not reflect production quality. Run `npm run build && npm start` then audit with Lighthouse to see real scores.

Accessibility reached 100 after fixing the `--muted-foreground` contrast ratio in light mode: the default shadcn value (`oklch(0.556 0 0)` ≈ #787878) sits at ~4.4:1 against white, just below the WCAG AA threshold of 4.5:1. Adjusted to `oklch(0.50 0 0)` (~4.8:1) — passes at all affected text sizes.
