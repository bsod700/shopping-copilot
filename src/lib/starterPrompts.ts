/**
 * @fileoverview Starter prompt suggestions shown on a fresh conversation.
 *
 * Prompts are phrased as things the user would say — generic enough to work as
 * conversation starters rather than one-off lookups, but specific enough to
 * immediately demonstrate the assistant's product-search capabilities.
 */

// A handful of real catalog categories, phrased as generic/trending questions
// so the prompts work as conversation starters rather than one-off lookups.
const STARTER_PROMPTS = [
  "What's on sale? Show me the biggest discounts",
  "Show me the best laptops",
  "What women's dresses do you have?",
  "Any sunglasses worth checking out?",
];

/** Return the static list of starter prompts. Async for future dynamic sourcing. */
export async function getStarterPrompts(): Promise<string[]> {
  return STARTER_PROMPTS;
}
