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

The core of this assignment is one model making tool calls against one REST API (DummyJSON) and streaming the result into a React UI, with a human-in-the-loop approval step before cart/checkout actions. The AI SDK covers exactly that surface: `streamText` on the server runs the tool loop (`searchProducts`, `getProduct`, `sortShownProducts`, `addToCart`, `checkout`, `suggestFollowUps` — see [systemPrompt.ts](src/lib/ai/systemPrompt.ts) and the chat route), and `useChat` on the client renders streamed text and tool-call parts without me writing a custom SSE parser. The built-in tool-approval state (`needsApproval`) is what drives the add-to-cart and checkout confirm dialogs — I did not have to build that flow myself.

**Rejected: LangChain**

LangChain's value is in chaining multiple models, retrievers, or agents together. This app has one model and one external API, called through plain tool definitions — there is no chain to build. Adopting it would mean wrapping `searchProducts` in a LangChain `Tool`, the model in a LangChain `Runnable`, and losing the direct `useChat`/`streamText` wiring the AI SDK already gives me for free in a Next.js route.

**Rejected: Mastra**

Mastra runs as its own agent server with its own persistence layer for conversation memory. This project needed the opposite: a Prisma schema I control directly (`Conversation`/`Message` tables, see Conversation & State below) so I can explain exactly how a `ChatUIMessage` is stored and reloaded. Routing chat through Mastra's server would mean either fighting its built-in memory to keep my own schema, or giving up control of persistence to a framework default.

**Rejected: assistant-ui**

assistant-ui is a React component library for chat UI, it has no opinion on how the server streams or calls tools. I would still need the AI SDK (or an equivalent) underneath it for `streamText` and tool execution, and on top of that adapt assistant-ui's component API to the AI SDK's `UIMessage` part shape (text, tool-call, tool-result, approval). That's an extra integration layer for a UI I'm already building with shadcn/ui components directly against `useChat`'s message parts.

**Rejected: CopilotKit**

CopilotKit is built for adding a copilot to an existing large application, with its own runtime, its own React provider tree, and automatic state synchronization between the UI and the agent. This assignment is the entire application, there is no separate app to bolt a copilot onto. The parts of CopilotKit I'd actually use, streaming a chat UI and calling tools, are exactly what the AI SDK already does with less surface area.

**Rejected: LibreChat**

LibreChat is a finished, deployable chat product (MongoDB, its own auth, its own plugin system), not a library to build a custom app with. The assignment asks for a purpose-built shopping assistant with a specific tool contract (search/get/sort/cart/checkout against DummyJSON) and a system prompt that encodes real catalog quirks (see systemPrompt.ts below). Standing up LibreChat would mean configuring and then fighting an existing product's assumptions instead of writing that contract myself.

---

## Retrieval Strategy

### How the system decides what to query

This app uses the Vercel AI SDK's tool calling. The model reads the user's message and decides whether to call `searchProducts`, and picks the parameters itself based on the system prompt's intent to parameter rules. It does not just extract a keyword. Category takes priority over keyword search whenever the request maps to one of the 24 known category slugs, since DummyJSON's category endpoint is more precise than its substring text search. Keyword search (`query`) is reserved for product types with no matching category slug.

The model receives a detailed system prompt that maps user intent to specific `searchProducts` tool parameters. The tool calls the DummyJSON API via one of three routes, selected in priority order:

1. **`category` set → `/products/category/{slug}`** — most precise for named categories (laptops, sunglasses, womens-dresses, etc.)
2. **`query` set → `/products/search?q=`** — free-text keyword match for product types with no category slug (blazer, frock, cardigan, etc.)
3. **Neither → `/products`** — full catalog browse, useful with sort params ("show me everything sorted by rating")

Sorting and filtering only happen if the user's request needs them. If the model sets `sortBy`, `rankBy`, `filterByTags`, or `outOfStock`, the app fetches the full pool of products and handles the sort or filter itself, since DummyJSON has no API for most of this: `filterByTags`, `outOfStock`, `inStock`, `minRating`, and `colorFilter`. If none of those are needed, the app just fetches the result directly at whatever limit the model set, up to 20.

### Which endpoints and parameters, and why

- `/products/category/{slug}` — used when the model sets `category`, the most precise route for a named category like laptops or sunglasses.
- `/products/search?q=` — used when the model sets `query` instead of a category, free-text match against title and description.
- `/products` — used when neither `category` nor `query` is set, a plain full-catalog browse.
- `/products/{id}` — detail fetch for a single product, called only when the user asks a follow-up about a product already shown, so the app does not re-run a full search when the id is already known.
- `/products/category-list` — returns the 24 category slugs, called when the model is unsure which slug matches what the user said. Cached for 24 hours since this list is static demo data that never changes.

**`searchProducts` parameters:**

- `category` — exact category slug (e.g. `smartphones`, `womens-dresses`). Determines which API endpoint to hit. Takes priority over `query` when both are set.
- `query` — free-text keyword. Only used for product types with no matching category slug (e.g. blazer, cardigan). When `category` is also set, `query` becomes a client-side title/tag filter — the DummyJSON search endpoint ignores `q` on category routes.
- `limit` — how many products to return (1–20). 1 for a single product, 5 for normal browsing, 20 for "show all". When sorting or ranking is needed the app fetches the full pool first then slices to `limit` after client-side processing.
- `sortBy` — sort field: `price`, `rating`, `title`, or `discountPercentage`. Always applied client-side after fetching the full pool — DummyJSON's server-side sort is unreliable on category endpoints.
- `order` — sort direction: `asc` (low to high) or `desc` (high to low). Paired with `sortBy`.
- `rankBy` — combined filter and sort shorthand, applied client-side on the full pool. Three modes: `budgetBestRated` keeps products rated ≥ 4 and sorts cheapest first (best value requests); `biggestDiscount` keeps only discounted products and sorts by highest discount first; `discountedBestRated` keeps only discounted products and sorts by highest rating first. Overrides `sortBy`/`order` when set.
- `minRating` — drops products with a rating below this value. Client-side.
- `inStock` — if true, excludes out-of-stock products. Client-side.
- `outOfStock` — if true, returns only out-of-stock products. Mutually exclusive with `inStock`. Client-side.
- `filterByTags` — keeps only products whose tags include at least one of these values. Used for sub-category filtering inside loose categories (e.g. `["vegetables"]` within groceries). Client-side.
- `colorFilter` — keeps only products where this color word appears in the title or description ("blue", "Blue", and "BLUE" all match). Client-side.

The DummyJSON API only natively supports `limit`, `sortBy`, `order`, and `q` (keyword search). Everything else — `rankBy`, `minRating`, `inStock`, `outOfStock`, `filterByTags`, `colorFilter` — is applied by the app after fetching the full product pool. `minPrice`/`maxPrice` don't exist in the API at all; price filtering is approximated by sorting cheapest first.

### Ambiguous and off-catalog queries

**Purely vague ("show me something cool", "what's nice?")** — no product tool is called. The model replies with a short clarifying question and offers 2–3 concrete directions as tappable suggestion chips (e.g. "Show me fashion items", "Show me gadgets"). This is enforced in the system prompt: if there is no objective signal in the message (no category, product type, color, or price word), the model must not guess and search.

**Vague + objective signal ("something cheap and cool", "something nice for the kitchen")** — the model searches on the objective part only (the price intent or the category), ignores the vague word as a filter, and briefly tells the user what it went with. A message like "something cheap and cool" triggers `sortBy: price, order: asc` on the nearest matching category.

**"best value" / "budget option"** — `rankBy: budgetBestRated`, which keeps only products rated ≥ 4 and sorts cheapest first. Both the price and quality dimensions are addressed in one call.

**Off-catalog ("a flight to Tokyo", "book me a hotel")** — the model does not call `searchProducts`. The system prompt lists the 24 valid categories and instructs the model to tell the user the shop doesn't carry that, without pretending to search. Travel, services, and digital goods all fall into this path.

### Multi-intent queries

When the user asks for multiple distinct things in one message (e.g. "show me a laptop and some sunglasses"), the model calls `searchProducts` once per distinct ask — two separate tool calls in the same turn, each with its own parameters. Each call returns its own product carousel, and the model labels each group in its reply so the user knows which results answer which part of their message.

---

## Conversation & State

### Where persistence lives and why

Conversation history is stored in SQLite via Prisma 7 using the `@prisma/adapter-better-sqlite3` driver adapter. This adapter was chosen over the alternative `@prisma/adapter-libsql` because `better-sqlite3` runs synchronously — reads and writes complete instantly with no async overhead, which is ideal for a local file database where latency is effectively zero. `libsql` is async and designed for remote or distributed SQLite (like Turso), which adds unnecessary complexity for a local-only app. Each conversation is a row in the `Conversation` table. Each message is a row in the `Message` table with a single `content` column that holds the entire message serialized as JSON — role, text, tool calls, tool results, and approval states all in one string. This avoids splitting a message across multiple columns or tables to represent the AI SDK's part structure, which would require transformation logic on every read and write. Messages are saved in a delete-then-recreate transaction: every time a conversation is saved, all its rows are deleted and reinserted from scratch. This is because the AI SDK assigns IDs to message parts (tool calls, text parts) during streaming, but those IDs can shift by the time the stream finishes. Trying to update existing rows would cause primary-key conflicts since the IDs no longer match what was stored mid-stream — deleting and reinserting avoids that entirely.

SQLite was chosen over the alternatives. Redis requires a running server and is designed for scenarios like real-time messaging or sharing data across multiple servers, none of which applies to a single local app. `localStorage` only exists in the browser, so Next.js server components cannot read it. The conversation list sidebar — which shows all past conversations and is rendered on the server — would have no data at render time and would need a separate browser-side request to fetch and populate it after the page loads. With SQLite, the server queries the database directly while rendering the page, so the sidebar is already populated when it arrives. On top of that, `localStorage` has a 5–10 MB limit that long conversations with many tool results would hit. In-memory storage was ruled out entirely because the assignment requires conversations to survive a page refresh.

Cart state lives in `localStorage` only. It's transient session state in a demo with no real checkout, so persisting it to the database would add complexity with no benefit.

### What happens when something goes wrong

**Storage full** — when SQLite runs out of disk space it returns an I/O error on write. The chat route uses `createUIMessageStream` to keep the stream open after the AI finishes, so if saving fails the server writes an error part back to the client before closing. The user sees a banner saying the conversation couldn't be saved, and the message will be lost on refresh. The AI response itself is unaffected — the error only concerns persistence.

**Corrupted database file** — Prisma throws on connect and the app fails to start. Fix: delete `dev.db` and re-run `npx prisma migrate deploy`.

**User clears localStorage mid-conversation** — the cart empties but conversation history in SQLite is unaffected. The user loses only their cart, the conversation stays intact.

---

## Evaluation

### How to run

| Command | What it runs | Needs `.env` |
|---|---|---|
| `npm test` | All unit and integration tests | No |
| `npm run test:unit` | Unit tests only (`tests/unit/`) | No |
| `npm run test:integration` | Integration tests only (`tests/integration/`) | No |
| `npm run test:watch` | Unit and integration tests in watch mode | No |
| `npm run test:e2e` | Playwright E2E tests (starts dev server automatically) | Yes — real OpenAI calls |
| `npm run eval` | All 28 LLM eval cases against the real model | Yes — real OpenAI calls |
| `npm run eval -- <case-id>` | A single eval case by id | Yes |

Single eval case example:

```bash
npm run eval -- off-catalog
npm run eval -- multi-intent
```

Available case ids: `normal-search`, `off-catalog`, `multi-intent`, `empty-result`, `detail-followup`, `category-list`, `budget-best-rated-dresses`, `category-synonym`, `groundedness-prices`, `womens-dresses-no-off-type`, `color-modifier-dress`, `sports-balls-only`, `out-of-stock`, `beverage-filtering`, `snack-filtering`, `popular-single-call`, `follow-up-suggestions`, `sort-by-price-asc`, `sort-by-rating-desc`, `sort-by-price-desc`, `multi-topic-sequential`, `multi-topic-same-turn`, `multi-topic-sort-second`, `category-womens-jewellery-slug`, `category-womens-watches`, `category-mens-watches-separate`, `category-skin-care-slug`, `category-no-duplicate-sort-suggestion`.

---

### What the test suite covers

Four layers, each catching a different class of bug.

**Unit tests (`tests/unit/dummyjson.test.ts`)** — `global.fetch` is mocked per test, no network. Verifies the three API routing branches: a `category` param hits `/products/category/{slug}`, a `query` param hits `/products/search?q=`, and neither hits `/products` directly. Verifies that `limit` and `select` are always sent, that `sortBy`/`order` are forwarded when `rankBy` is not set, and that `rankBy` overrides them and forces `limit=0` to fetch the full pool. Two tests cover the `budgetBestRated` client-side logic specifically: with a 4-product fixture it checks that products rated below 4 are filtered out, that the remaining ones are sorted cheapest first, and that the result is sliced to the requested limit. A separate test checks the fallback — if nothing clears the rating threshold, the full unfiltered pool is returned sorted by price instead of returning empty results. Two error tests verify that both an HTTP 500 response and a thrown network exception both return `{ products: [], error }` instead of throwing. Finally `getProduct` and `listCategories` are each verified with a minimal mock.

**Unit tests (`tests/unit/persistence.test.ts`)** — the `@/lib/db` module is mocked so the real database singleton and environment variables are never loaded. A fresh in-memory SQLite database is created using `PrismaBetterSqlite3({ url: ":memory:" })` and the schema is applied with `$executeRawUnsafe` before any test runs. Each test starts with a clean slate via `beforeEach` deletion. Covers: saving messages and reading them back, the delete-then-recreate transaction (a second save replaces the first entirely, no orphaned rows), `createdAt` injection from the DB row into `message.metadata`, parts array round-tripping through JSON serialization, chronological ordering on load, `findOrCreateEmptyConversation` reuse logic (reuses an empty untitled conversation but not one that has messages or a renamed title), cascade delete removing messages when a conversation is deleted, and `listConversations` ordering newest-updated-first.

**Integration tests (`tests/integration/searchProducts.integration.test.ts`)** — same `fetch` mock approach, but uses a realistic fixture (`tests/fixtures/products.json`) that mirrors an actual DummyJSON response with real field names, nested `reviews`, `brand`, and `availabilityStatus`. The unit tests use minimal stub objects that can accidentally pass even when field normalization is wrong — these tests catch shape mismatches: does `brand` come through, does `availabilityStatus` survive, does the reviews array have the right length. A second test runs `rankBy: budgetBestRated` on the fixture's real rating values — Apple MacBook Pro has a 2.99 rating and must be excluded, leaving Lenovo (rated above 4 at $1199.99) as the winner.

**E2E tests (`tests/e2e/chat-flow.spec.ts`, Playwright)** — runs against a real Next.js dev server with live OpenAI API calls. Three tests run in serial because each depends on state from the previous one. The core flow test types "show me some smartphones", waits up to 60 seconds for a product card to appear, and checks that it has an image and a visible price. The persistence test does the same search, then reloads the page and retries until both the original message text and at least one product card are visible again — this is the only test that exercises the full SQLite write-then-read path under a real response. The new conversation test verifies that clicking "New chat" navigates to a different URL, clears the previous messages, and adds a new entry to the conversation sidebar.

**Eval suite (`tests/evals/`, 28 cases)** — each case sends one or more turns through `streamText` with the real model, the real system prompt, and the real tools (same config as production), then runs a programmatic pass/fail check. No LLM judge. The checks are deterministic: did the model call the right tool, with the right parameters, and not say something it shouldn't have? Cases cover: off-catalog refusal (no `searchProducts` call, no invented price for a flight to Tokyo), multi-intent in one message (two separate `searchProducts` calls, one per topic), category synonym mapping (`perfume` must produce `category: fragrances`, not a keyword search), price groundedness (every `$X.XX` in the reply must match a price from tool results), product type fidelity (suits and corsets in the womens-dresses category must not be described as dresses), sort behavior (a sort request after a search must call `sortShownProducts` on the already-shown products, not trigger a new API call), multi-topic sequential sorting (a sort after the second of two searches must sort the second search's products, not the first), specific category slug correctness (womens-jewellery not womens-jewelry, skin-care not skincare, mens-watches not womens-watches), and follow-up suggestions (at least 2 chips via `suggestFollowUps`). Exits with code 1 if any case fails so CI can block on it.

### What regressions these catch

- Wrong API endpoint used for a given input (`/search` when `category` was set, or `/products` when `query` was set)
- `rankBy` sending `sortBy`/`order` to the server instead of fetching the full pool and sorting client-side
- `budgetBestRated` returning products rated below 4, sorting them wrong, or returning empty results when no product clears the threshold (instead of falling back to the full pool)
- Field normalization broken after a DummyJSON response shape change (missing `brand`, missing `reviews`)
- The delete-then-recreate transaction leaving orphaned rows or failing to replace the previous message list
- `loadMessages` not injecting `createdAt` into metadata, breaking per-message timestamps in the UI
- `findOrCreateEmptyConversation` creating a duplicate empty conversation instead of reusing the existing one
- Cascade delete not removing messages when a conversation is deleted
- The model using `query: "perfume"` instead of `category: "fragrances"` for a known synonym
- The model calling `searchProducts` for an off-catalog item like a flight booking
- The model inventing a price that was not in the tool result
- A sort request triggering a full new API search instead of calling `sortShownProducts`
- Messages not written to SQLite (E2E persistence test reloads and checks)

### What would slip through

**DummyJSON API changes** — every layer mocks `fetch`, so a breaking change upstream (renamed field, removed endpoint) only surfaces when someone runs the app manually.

**Visual and layout regressions** — Playwright checks for element presence and text content, not pixel layout. A card that renders in the wrong position or with broken styles passes all tests.

**Carousel and scroll behavior** — drag-to-scroll is not exercised in Playwright because it requires touch simulation. Overflow clipping, scroll snap, and mouse drag all go untested.

**The chat API route has no tests** — `POST /api/chat` itself (request parsing, the `createUIMessageStream` setup, the persistence error notification path) is not unit or integration tested. Testing it would require mocking the AI SDK's streaming, which is possible but was not done here.

**Prompt regressions outside the eval cases** — the 28 eval cases cover specific behaviors. A prompt change that makes the model start describing products less clearly, skipping important caveats, or formatting replies differently would not be caught unless a new case is added for it.

**Connection drop mid-stream** — the persistence test only verifies a clean completion. If the stream is interrupted, the partial message is not saved, but no test exercises this path.

---

## Known Limitations

### Where the system underperforms today

**No real price filtering.** DummyJSON has no `minPrice`/`maxPrice` parameter. "Laptops under $500" returns laptops sorted cheapest-first — not a filtered set. The response flags this when the intent is clearly a hard budget cap, but the user still sees products above their limit.

**Category + query can't be combined at the API level.** When the model sets both `category` and `query`, `tools.ts` strips the query before calling `dummyjsonSearch` — the category wins and the brand/model constraint is silently dropped. A request for "Samsung phones" with `category:"smartphones"` returns generic smartphones, not Samsung-filtered ones. There is no fallback that applies the dropped query as a keyword search.

**DummyJSON's text search is substring-only.** `query:"perfume"` does not match "Eau De Parfum". The system prompt maps common synonyms to category slugs (`perfume → fragrances`), but anything outside that hand-coded list produces zero results with no signal to the user about why.

**The in-memory cache and shown-IDs map reset on server restart.** Both live in module-scope Maps in `tools.ts` (`cache`, `shownIdsByConversation`). A restart clears all deduplication state, so "show me more" after a restart can repeat products the user already saw in the same conversation.

**No streaming recovery.** The `onFinish` callback inside `toUIMessageStream` only fires on clean completion. A dropped connection mid-stream means the partial response is never passed to `saveMessages`, and the turn is silently lost on refresh. The user has no way to recover it.

**The chat route has no automated tests.** `POST /api/chat` — request parsing, the `createUIMessageStream` setup, `compressOldToolResults`, and the persistence-error notification path — has zero test coverage. Testing it requires mocking the AI SDK's streaming internals, which is non-trivial.

**Context compression is call-count-based, not token-count-based.** `compressOldToolResults` compresses `searchProducts` tool results that are more than one user turn back. A single multi-intent turn that triggers five tool calls keeps all five full payloads in context until the next user message, regardless of how close to the model's token limit the conversation is.

### What I'd change with another week

1. **Client-side price range filtering.** Fetch the full category pool with `limit:0`, apply a `minPrice`/`maxPrice` filter in the app, then slice to the requested limit. The user gets a real "under $X" result set instead of the sorted approximation.

2. **Synonym expansion table.** A static map (`perfume → fragrances`, `sneakers → mens-shoes`, `cologne → fragrances`) eliminates wrong-slug guesses on common terms. This covers the same gap as semantic/vector search for a catalog this size — DummyJSON has a small static catalog across 24 fixed categories (confirmed by `/products/category-list`). A vector store adds an embedding model, a vector DB, and an index-build step for a benefit a 30-line object literal already delivers at this scale.

3. **Like/unlike on assistant responses.** A thumbs-down on each assistant turn, backed by a `rating` column on the `Message` table, gives concrete signal about which responses fail in practice. Flagged turns feed directly into new eval cases — the user's actual inputs define the edge cases the 28-case suite doesn't cover yet, and the suite grows from real usage rather than pre-seeded scenarios.

4. **LLM-assisted eval repair.** When an eval case fails, pass the failing turn (system prompt, tool calls, expected behavior, actual output) back to the model and ask it to identify what in the system prompt caused the mismatch and suggest a fix. This compresses the iterate-on-prompt loop without requiring manual diff-reading after every model upgrade.

5. **Streaming persistence.** Capture the partial response on stream error in the `createUIMessageStream` `execute` body and save it before the stream closes, so interrupted responses aren't silently dropped.

6. **Server-side cart.** Move cart state from `localStorage` to `Cart`/`CartItem` tables so multi-tab sessions share state and a `localStorage.clear()` doesn't wipe items mid-session.

7. **Token-aware context compression.** Replace the turn-count cutoff in `compressOldToolResults` with a token-count check. The AI SDK exposes `usage.inputTokens` in `onFinish` — use that to compress when approaching the model's context limit rather than after an arbitrary number of turns.

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
