# Handoff

## Session: Dress filtering fix (2026-06-15)

### Bug fixed
"What women's dresses do you have?" (and similar plain product-type queries) returned
off-type items from the same DummyJSON category (e.g. "Corset With Black Skirt",
"Marni Red & Black Suit" from `womens-dresses`), listed as if they were dress options
with only a dismissive footnote. User wanted ONLY genuine dresses returned, no off-type
items, with or without a color/style modifier.

### Root cause
`/products/category/<slug>` ignores the `q` (query) param when both `category` and
`query` are set by the model, so off-type catalog-category-mates leak through despite
prompt instructions.

### Changes made
- **[src/lib/dummyjson.ts](src/lib/dummyjson.ts)** - `searchProducts`: when both `category`
  and `query` are set ("bothSet"), fetch the full category (limit=0) and post-filter
  products where title or any tag includes the query string, before sort/rank/limit.
  Broadening logic (for "show more") now triggers on empty results too, not just
  all-repeats, and drops `query` (not just `rankBy`) when broadening.
- **[src/lib/ai/systemPrompt.ts](src/lib/ai/systemPrompt.ts)** - rewrote "Color and style
  modifiers" section into "Product-type filtering (with or without color/style
  modifiers)": search by bare product-type noun only (no category/rankBy), keep only
  results whose title/tags actually match that type, and never list off-type items
  even "with a note".
- **[src/lib/ai/tools.ts](src/lib/ai/tools.ts)** - `searchProducts` tool converted to a
  factory `createSearchProductsTool(conversationId)`. The "already shown product ids"
  tracking (used for "show more" broadening) is now scoped per-conversation
  (`shownIdsByConversation: Map<conversationId, Map<key, Set<id>>>`) instead of a single
  global Map, so unrelated conversations / eval cases don't pollute each other's state.
- **[src/app/api/chat/route.ts](src/app/api/chat/route.ts)** - uses
  `createSearchProductsTool(conversationId)` in the tools object passed to `streamText`.
- **[tests/evals/run-evals.ts](tests/evals/run-evals.ts)** - same factory pattern, each
  eval case gets its own conversationId (`eval-<caseId>`) to avoid cross-case state leak.
- **[tests/evals/prompts.ts](tests/evals/prompts.ts)** - new eval case
  `womens-dresses-no-off-type`: "What women's dresses do you have?" must list only
  genuine dresses, not corsets/suits from the same category. 15 eval cases total.

### Verification
- Full eval suite: 15/15 passed (run twice).
- Live in preview: "What women's dresses do you have?" now shows only Dress Pea.

### Known flaky test (pre-existing, not caused by this session)
- `follow-up-suggestions`: intermittently fails because the model occasionally skips
  calling `suggestFollowUps` after a `budgetBestRated` sports-accessories search.
  Not investigated yet.

### Not done yet
- Clean up test-artifact conversations in `dev.db` from browser verification sessions.

### Tooling note
- Added `.claude/skills/repo-handoff/SKILL.md` - a project-local skill (distinct from
  the user-level Discord/Notion `save-progress` skill) that updates this file. Trigger
  with "update the handoff" / "repo handoff" rather than "save progress" to avoid
  ambiguity with the Discord skill. [CLAUDE.md](CLAUDE.md) now points every session at
  this file first.
