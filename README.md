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

To browse the database (conversations and messages) in a web UI:

```bash
npm run db:studio
# → Open http://localhost:5555
```

---

## Architecture & Framework Choice

**Chosen: Vercel AI SDK v6**

The core of this assignment is one model making tool calls against one REST API (DummyJSON) and streaming the result into a React UI, with a human-in-the-loop approval step before cart/checkout actions. The AI SDK covers exactly that surface: `streamText` on the server runs the tool loop (`searchProducts`, `getBestRated`, `getProduct`, `sortShownProducts`, `listCategories`, `addToCart`, `checkout`, `suggestFollowUps` — see [systemPrompt.ts](src/lib/ai/systemPrompt.ts) and [route.ts](src/app/api/chat/route.ts)), and `useChat` on the client automatically updates the UI as tokens stream in. The built-in tool-approval state (`needsApproval`) drives the add-to-cart and checkout confirm dialogs out of the box.

**Rejected: LangChain**

LangChain is an orchestrator — it's built to coordinate multiple models, retrievers, or agents working together, like a conductor managing an orchestra. This app has one model and one API. There's nothing to orchestrate. Using it here would mean wrapping everything in LangChain abstractions (`Tool`, `Runnable`, chains) just to end up doing the same thing the AI SDK already does directly with `streamText` and `useChat`.

**Rejected: Mastra**

Mastra runs as its own agent server with its own persistence layer for conversation memory. This project needed the opposite: a Prisma schema I control directly (`Conversation`/`Message` tables, see Conversation & State below) so I can explain exactly how a `ChatUIMessage` is stored and reloaded. Routing chat through Mastra's server would mean either fighting its built-in memory to keep my own schema, or giving up control of persistence to a framework default.

**Rejected: assistant-ui**

assistant-ui is a React component library for chat UI, it has no opinion on how the server streams or calls tools. I would still need the AI SDK (or an equivalent) underneath it for `streamText` and tool execution, and on top of that adapt assistant-ui's component API to the AI SDK's `UIMessage` part shape (text, tool-call, tool-result, approval). That's an extra integration layer for a UI I'm already building with shadcn/ui components directly against `useChat`'s message parts.

**Rejected: CopilotKit**

CopilotKit is built for adding a copilot to an existing large application, with its own runtime, its own React provider tree, and automatic state synchronization between the UI and the agent. This assignment is the entire application, there is no separate app to bolt a copilot onto. The parts of CopilotKit I'd actually use, streaming a chat UI and calling tools, are exactly what the AI SDK already does with less surface area.

**Rejected: LibreChat**

LibreChat is a finished, deployable chat product (MongoDB, its own auth, its own plugin system), not a library to build a custom app with. The assignment asks for a purpose-built shopping assistant with a specific tool contract (search/get/sort/cart/checkout against DummyJSON) and a system prompt that encodes real catalog quirks. Standing up LibreChat would mean configuring and then fighting an existing product's assumptions instead of writing that contract myself.

---

## Retrieval Strategy

### How the system decides what to query

This app uses the Vercel AI SDK's tool calling. The model reads the user's message and decides whether to call `searchProducts`, and decides what parameters to pass based on what the user is asking for. It doesn't just pull out a keyword and search — it first checks if the request maps to one of the 24 known category slugs (like `smartphones` or `womens-dresses`), because searching by category gives more accurate results than a text search. Free-text keyword search is only used when there's no matching category slug for what the user asked.

The system prompt gives the model clear rules for how to translate what the user says into the right API call. Depending on what the model decides, the app hits one of three DummyJSON endpoints, in this priority order:

1. **`category` set → `/products/category/{slug}`** — most precise for named categories (laptops, sunglasses, womens-dresses, etc.)
2. **`query` set → `/products/search?q=`** — free-text keyword match for product types with no category slug (blazer, frock, cardigan, etc.)
3. **Neither → `/products`** — full catalog browse, useful with sort params ("show me everything sorted by rating")

Sorting and filtering only happen if the user's request needs them. If the model sets `sortBy`, `rankBy`, `filterByTags`, or `outOfStock`, the app fetches the full pool of products and handles the sort or filter itself, since DummyJSON has no API for most of this: `filterByTags`, `outOfStock`, `inStock`, `minRating`, and `colorFilter`. If none of those are needed, the app just fetches the result directly at whatever limit the model set, up to 20.

### Which endpoints and parameters, and why

- `/products/category/{slug}` — used when the model sets `category`, the most precise route for a named category like laptops or sunglasses.
- `/products/search?q=` — used when the model sets `query` instead of a category, free-text match against title and description.
- `/products` — used when neither `category` nor `query` is set, a plain full-catalog browse.
- `/products/{id}` — detail fetch for a single product, called only when the user asks a follow-up about a product already shown, so the app does not re-run a full search when the id is already known.
- `/products/category-list` — returns the 24 category slugs, called when the model is unsure which slug matches what the user said. Cached for 5 minutes (the process-level cache TTL); in practice the list is static demo data and never changes at runtime.

**`searchProducts` parameters:**

- `category` — exact category slug (e.g. `smartphones`, `womens-dresses`). Controls which API endpoint gets called. Takes priority over `query` when both are set.
- `query` — free-text keyword. Only used for product types with no matching category slug (e.g. blazer, cardigan). When `category` is also set, the app calls the category endpoint — which doesn't support text search, so the app itself filters the results after they come back, keeping only products whose title or tags match the query.
- `limit` — how many products to return (1–20). 1 for a single product, 5 for normal browsing, 20 for "show all". When sorting or ranking is needed the app fetches the full pool first then slices to `limit` after client-side processing.
- `sortBy` — sort field: `price`, `rating`, `title`, or `discountPercentage`. Applied after fetching the full pool — DummyJSON's server-side sort doesn't work correctly on category endpoints. If the user asks to sort products already shown, `sortShownProducts` re-sorts them in memory. If a fresh fetch is needed, the result is cached for 5 minutes.
- `order` — sort direction: `asc` (low to high) or `desc` (high to low). Always paired with `sortBy`.
- `rankBy` — combined filter and sort shorthand. Three modes: `budgetBestRated` keeps products rated ≥ 4 and sorts cheapest first (best value requests); `biggestDiscount` keeps only discounted products and sorts by highest discount first; `discountedBestRated` keeps only discounted products and sorts by highest rating first. Overrides `sortBy`/`order` when set.
- `minRating` — drops products with a rating below this value.
- `inStock` — if true, excludes out-of-stock products.
- `outOfStock` — if true, returns only out-of-stock products. Mutually exclusive with `inStock`.
- `filterByTags` — keeps only products whose tags include at least one of these values. Used for sub-category filtering inside loose categories (e.g. `["vegetables"]` within groceries).
- `colorFilter` — keeps only products where this color word appears in the title or description ("blue", "Blue", and "BLUE" all match).
- `maxPrice` — keeps only products priced at or below this value. Use for "under $X" / "below $X" / "less than $X" requests. Applied client-side after fetching the full pool, since DummyJSON has no price-range API parameter.
- `minPrice` — keeps only products priced at or above this value. Applied the same way.

**Parameters that trigger an API call:** `category`, `query`, `limit`

**Parameters applied in the app on the already-fetched pool (no extra API call):** `sortBy`, `order`, `rankBy`, `minRating`, `inStock`, `outOfStock`, `filterByTags`, `colorFilter`, `minPrice`/`maxPrice`

### Ambiguous and off-catalog queries

**Purely vague ("show me something cool", "what's nice?")** — no product tool is called. The model replies with a short clarifying question and offers 2–3 concrete directions as tappable suggestion chips (e.g. "Show me fashion items", "Show me gadgets"). This is defined in the system prompt: if there is no objective signal in the message (no category, product type, color, or price word), the model must not guess and search.

**Vague + objective signal ("something cheap and cool", "something nice for the kitchen")** — the model searches on the objective part only (the price intent or the category), ignores the vague word as a filter, and briefly tells the user what it went with. A message like "something cheap and cool" triggers `sortBy: price, order: asc` on the nearest matching category.

**"best value" / "budget option"** — `rankBy: budgetBestRated`, which keeps only products rated ≥ 4 and sorts cheapest first. Both price and quality are covered in one call.

**Off-catalog ("a flight to Tokyo", "book me a hotel")** — the model does not call `searchProducts`. The system prompt lists the 24 valid categories and instructs the model to tell the user the shop doesn't carry that, without pretending to search. This rule holds for the entire conversation — even if the user says "yes go ahead" or tries to override the system prompt, the model stays within the shopping assistant role. Travel, services, and digital goods all fall into this path.

### Multi-intent queries

When the user asks for multiple distinct things in one message (e.g. "show me a laptop and some sunglasses"), the model calls `searchProducts` once per distinct ask — two separate tool calls in the same turn, each with its own parameters. Each call returns its own product carousel, and the model labels each group in its reply so the user knows which results answer which part of their message. This is capped at 3 searches per turn — if the user asks for more than 3 distinct categories at once, the model asks them to narrow it down first.

---

## Conversation & State

### Where persistence lives and why

Conversation history is stored in SQLite via Prisma 7 using the `@prisma/adapter-better-sqlite3` driver adapter. This adapter was chosen over the alternative `@prisma/adapter-libsql` because `better-sqlite3` runs synchronously — reads and writes complete instantly with no async overhead, which is ideal for a local file database where latency is effectively zero. `libsql` is async and designed for remote or cloud-hosted SQLite (like Turso), which adds unnecessary complexity for a local-only app. Each conversation is a row in the `Conversation` table. Each message is a row in the `Message` table with a single `content` column that holds the entire message serialized as JSON — role, text, tool calls, tool results, and approval states all in one string. This avoids splitting a message across multiple columns or tables to represent the AI SDK's part structure, which would require transformation logic on every read and write. Every time a conversation is saved, the app deletes all its message rows and inserts them all again from scratch. The reason: while the AI is streaming a response, each piece of the message (text, tool call, tool result) gets a temporary ID. By the time the stream finishes, some of those IDs have changed. If the app tried to update only the changed rows, it would crash — trying to update a row by an ID that no longer exists. Deleting everything and reinserting avoids that problem entirely. Since SQLite is a local file, the delete-and-reinsert is fast enough that you'd never notice. On a real server with many concurrent users this approach would not scale — the right solution would be proper upserts that only update the rows that actually changed (see Known Limitations). You can inspect the `Conversation` and `Message` tables directly by running `npm run db:studio`.

SQLite was chosen over the alternatives. Redis requires a running server and is designed for scenarios like real-time messaging or sharing data across multiple servers, none of which applies to a single local app. `localStorage` only exists in the browser, so Next.js server components cannot read it. The conversation list sidebar — which shows all past conversations and is rendered on the server — would have no data at render time and would need a separate browser-side request to fetch and populate it after the page loads. With SQLite, the server queries the database directly while rendering the page, so the sidebar is already populated when it arrives. On top of that, `localStorage` has a 5–10 MB limit that long conversations with many tool results would hit. In-memory storage was ruled out entirely because the assignment requires conversations to survive a page refresh. SQLite works well here because this is a local-only app running on one machine — on a real server with multiple instances (like auto-scaling on Vercel or AWS), each instance would have its own separate file and they'd never share data. For a production deployment the right choice would be a hosted database like PostgreSQL (see Known Limitations).

Cart state lives in `localStorage` only. It's temporary session state in a demo with no real checkout, so saving it to the database would add complexity with no benefit. The limitation is that the cart doesn't survive a `localStorage.clear()`, isn't shared across tabs, and disappears if the user switches devices (see Known Limitations).

### What happens when something goes wrong

**Storage full** — when SQLite runs out of disk space it returns an I/O error on write. The chat route uses `createUIMessageStream` to keep the stream open after the AI finishes, so if saving fails the server writes an error part back to the client before closing. The user sees a banner saying the conversation couldn't be saved, and the message will be lost on refresh. The AI response itself is unaffected — the error only concerns saving to the database (see Known Limitations — Streaming persistence).

**Corrupted database file** — Prisma throws on connect and the app fails to start. Fix: delete `dev.db` and re-run `npx prisma migrate deploy`. This wipes all conversation history — acceptable for a local demo with no real user data, but on a real server you'd restore from a backup instead of deleting.

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

Available case ids: `normal-search`, `off-catalog`, `multi-intent`, `empty-result`, `detail-followup`, `category-list`, `price-cap-smartphones`, `budget-best-rated-dresses`, `category-synonym`, `groundedness-prices`, `womens-dresses-no-off-type`, `color-modifier-dress`, `sports-balls-only`, `out-of-stock`, `beverage-filtering`, `snack-filtering`, `popular-single-call`, `follow-up-suggestions`, `sort-by-price-asc`, `sort-by-rating-desc`, `sort-by-price-desc`, `multi-topic-sequential`, `multi-topic-same-turn`, `multi-topic-sort-second`, `category-womens-jewellery-slug`, `category-womens-watches`, `category-mens-watches-separate`, `category-skin-care-slug`, `category-no-duplicate-sort-suggestion`.

---

### What the test suite covers

Four layers, each catching a different class of bug.

**Unit tests (`tests/unit/dummyjson.test.ts`)** — `global.fetch` is mocked per test, no network. Verifies the three API routing branches: a `category` param hits `/products/category/{slug}`, a `query` param hits `/products/search?q=`, and neither hits `/products` directly. Verifies that `limit` and `select` are always sent, that `sortBy`/`order` are forwarded when `rankBy` is not set, and that `rankBy` overrides them and forces `limit=0` to fetch the full pool. Two tests cover the `budgetBestRated` client-side logic specifically: with a 4-product fixture it checks that products rated below 4 are filtered out, that the remaining ones are sorted cheapest first, and that the result is sliced to the requested limit. A separate test checks the fallback — if nothing clears the rating threshold, the full unfiltered pool is returned sorted by price instead of returning empty results. Three tests cover `maxPrice`/`minPrice` filtering: `maxPrice` excludes products above the cap and forces `limit=0` to fetch the full pool first, `minPrice` excludes products below the floor, and a third confirms an empty result when no products fall in range. Two error tests verify that both an HTTP 500 response and a thrown network exception both return `{ products: [], error }` instead of throwing. Finally `getProduct` and `listCategories` are each verified with a minimal mock.

**Unit tests (`tests/unit/persistence.test.ts`)** — the `@/lib/db` module is mocked so the real database singleton and environment variables are never loaded. A fresh in-memory SQLite database is created using `PrismaBetterSqlite3({ url: ":memory:" })` and the schema is applied with `$executeRawUnsafe` before any test runs. Each test starts with a clean slate via `beforeEach` deletion. Covers: saving messages and reading them back, the delete-then-recreate transaction (a second save replaces the first entirely, no orphaned rows), `createdAt` injection from the DB row into `message.metadata`, parts array round-tripping through JSON serialization, chronological ordering on load, `findOrCreateEmptyConversation` reuse logic (reuses an empty untitled conversation but not one that has messages or a renamed title), cascade delete removing messages when a conversation is deleted, and `listConversations` ordering newest-updated-first.

**Integration tests (`tests/integration/searchProducts.integration.test.ts`)** — same `fetch` mock approach, but uses a realistic fixture (`tests/fixtures/products.json`) that mirrors an actual DummyJSON response with real field names, nested `reviews`, `brand`, and `availabilityStatus`. The unit tests use minimal stub objects that can accidentally pass even when field normalization is wrong — these tests catch shape mismatches: does `brand` come through, does `availabilityStatus` survive, does the reviews array have the right length. A second test runs `rankBy: budgetBestRated` on the fixture's real rating values — Apple MacBook Pro has a 2.99 rating and must be excluded, leaving Lenovo (rated above 4 at $1199.99) as the winner.

**E2E tests (`tests/e2e/chat-flow.spec.ts`, Playwright)** — runs against a real Next.js dev server with live OpenAI API calls. Three tests run in serial because each depends on state from the previous one. The core flow test types "show me some smartphones", waits up to 60 seconds for a product card to appear, and checks that it has an image and a visible price. The persistence test does the same search, then reloads the page and retries until both the original message text and at least one product card are visible again — this is the only test that exercises the full SQLite write-then-read path under a real response. The new conversation test verifies that clicking "New chat" navigates to a different URL, clears the previous messages, and adds a new entry to the conversation sidebar.

**Eval suite (`tests/evals/`, 29 cases)** — each case sends one or more turns through `streamText` with the real model, the real system prompt, and the real tools (same config as production), then runs a programmatic pass/fail check. No LLM judge. The checks are simple pass/fail rules: did the model call the right tool, with the right parameters, and not say something it shouldn't have? Cases cover: off-catalog refusal (no `searchProducts` call, no invented price for a flight to Tokyo), multi-intent in one message (two separate `searchProducts` calls, one per topic), category synonym mapping (`perfume` must produce `category: fragrances`, not a keyword search), price cap filtering ("smartphones under $500" must set `maxPrice: 500` and return only products priced at or below that), price groundedness (every `$X.XX` in the reply must match a price from tool results), product type fidelity (suits and corsets in the womens-dresses category must not be described as dresses), sort behavior (a sort request after a search must call `sortShownProducts` on the already-shown products, not trigger a new API call), multi-topic sequential sorting (a sort after the second of two searches must sort the second search's products, not the first), specific category slug correctness (womens-jewellery not womens-jewelry, skin-care not skincare, mens-watches not womens-watches), and follow-up suggestions (at least 2 chips via `suggestFollowUps`). Exits with code 1 if any case fails so CI can block on it.

### What regressions these catch

- Wrong API endpoint used for a given input (`/search` when `category` was set, or `/products` when `query` was set)
- `rankBy` sending `sortBy`/`order` to the server instead of fetching the full pool and sorting client-side
- `budgetBestRated` returning products rated below 4, sorting them wrong, or returning empty results when no product clears the threshold (instead of falling back to the full pool)
- `maxPrice`/`minPrice` leaking products outside the requested price range, or failing to force `limit=0` so the full pool is fetched before filtering
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

---

## Known Limitations

### Where the system underperforms today


**Category + query can't be combined at the API level.** When the model sets both `category` and `query`, `tools.ts` strips the query before calling `dummyjsonSearch` — the category wins and the brand/model constraint is silently dropped. A request for "Samsung phones" with `category:"smartphones"` returns generic smartphones, not Samsung-filtered ones. There is no fallback that applies the dropped query as a keyword search.

**DummyJSON's text search is substring-only.** `query:"perfume"` does not match "Eau De Parfum". The system prompt maps common synonyms to category slugs (`perfume → fragrances`), but anything outside that hand-coded list produces zero results with no signal to the user about why.

**The in-memory cache and shown-IDs map reset on server restart.** Both live in module-scope Maps in `tools.ts` (`cache`, `shownIdsByConversation`). A restart clears all deduplication state, so "show me more" after a restart can repeat products the user already saw in the same conversation.

**No streaming recovery.** The `onFinish` callback inside `toUIMessageStream` only fires on clean completion. A dropped connection mid-stream means the partial response is never passed to `saveMessages`, and the turn is silently lost on refresh. The user has no way to recover it.

**The chat route has no automated tests.** `POST /api/chat` — request parsing, the `createUIMessageStream` setup, `compressOldToolResults`, and the persistence-error notification path — has zero test coverage. Testing it requires mocking the AI SDK's streaming internals, which is non-trivial.

**Not built to scale beyond a single machine.** SQLite is a file on disk — if the app ran on multiple server instances (auto-scaling), each would have its own separate file and they'd never share data. This is an intentional tradeoff for a local-only assignment — scaling to a real server would require replacing SQLite with a hosted database (PostgreSQL, PlanetScale).

**No database backup or restore mechanism.** If `dev.db` gets corrupted the only fix is to delete it and start fresh, losing all conversation history. For a local demo this is acceptable, but a real app would need automated backups before every migration.

**Context compression is message-count-based, not token-count-based.** `compressOldToolResults` shrinks old search results after each message to save tokens. A message that triggers multiple searches keeps all those full results in context until the next message, regardless of how close to the model's token limit the conversation is.

### What I'd change with another week

1. **Synonym expansion table.** A static map (`perfume → fragrances`, `sneakers → mens-shoes`, `cologne → fragrances`) eliminates wrong-slug guesses on common terms. DummyJSON has only 24 fixed categories, so a 30-line object covers all the non-obvious mappings without any extra infrastructure.

2. **Like/unlike on assistant responses.** A thumbs-down on each assistant turn, backed by a `rating` column on the `Message` table, gives concrete signal about which responses fail in practice. Flagged turns feed directly into new eval cases — the user's actual inputs define the edge cases the 28-case suite doesn't cover yet, and the suite grows from real usage rather than pre-seeded scenarios.

4. **LLM-assisted eval repair.** When an eval case fails, pass the failing turn (system prompt, tool calls, expected behavior, actual output) back to the model and ask it to identify what in the system prompt caused the mismatch and suggest a fix. This removes the need to manually read through the system prompt and guess what to change every time the model behaves wrong after an upgrade.

5. **Replace delete-and-reinsert with proper upserts.** The current approach deletes all messages in a conversation and reinserts them from scratch on every save. This works fine on a local SQLite file but would be too slow and wasteful on a real server with many users. The right approach is to track which message IDs are stable after streaming finishes and only update or insert the rows that actually changed.

6. **Server-side cart.** Move cart state from `localStorage` to `Cart`/`CartItem` tables so multi-tab sessions share state and a `localStorage.clear()` doesn't wipe items mid-session.

7. **Automatic database backups before migrations.** Right now a corrupted `dev.db` means deleting it and losing everything. Adding an automatic backup step before `prisma migrate deploy` runs would mean you can restore the previous state instead of starting from scratch.

8. **Token-aware context compression.** Replace the turn-count cutoff in `compressOldToolResults` with a token-count check. The AI SDK exposes `usage.inputTokens` in `onFinish` — use that to compress when approaching the model's context limit rather than after a fixed number of messages.

9. **Fix persistence test schema drift.** `tests/unit/persistence.test.ts` creates an in-memory SQLite database using hardcoded `CREATE TABLE` statements. If `prisma/schema.prisma` gains a new column, those statements won't update automatically, so the tests keep passing even though they're out of sync with the real schema. The fix is to run the actual migration files from `prisma/migrations/` inside the test instead of writing the table structure by hand.

10. **LLM-as-judge eval layer.** The current 28 eval cases use deterministic programmatic checks (did the model call the right tool, did it mention the right price). They can't catch quality problems — a reply that is technically correct but reads poorly, skips an important detail, or lists products in a confusing order. Adding an LLM judge that scores each reply on helpfulness, groundedness, and tone would catch regressions that pass all current checks.

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
