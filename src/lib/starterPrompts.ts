// A handful of real catalog categories, phrased as generic/trending questions
// so the prompts work as conversation starters rather than one-off lookups.
const STARTER_PROMPTS = [
  "What's trending in fragrances?",
  "Show me the best laptops",
  "What women's dresses do you have?",
  "Any sunglasses worth checking out?",
];

export async function getStarterPrompts(): Promise<string[]> {
  return STARTER_PROMPTS;
}
