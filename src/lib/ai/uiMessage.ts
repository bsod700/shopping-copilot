/**
 * @fileoverview Typed UIMessage for this app's tool set.
 *
 * The Vercel AI SDK's `UIMessage` is generic over metadata and tool types.
 * `ChatUIMessage` pins those generics so every message part is fully typed —
 * e.g. `part.type === "tool-searchProducts"` narrows `part.output` to
 * `SearchProductsResult` automatically, no manual casting needed.
 *
 * `createdAt` in metadata is written by `persistence.ts` when loading from DB
 * and read by `ChatWindow` to show per-message timestamps in the UI.
 */
import type { UIMessage, InferUITools } from "ai";
import type {
  createSearchProductsTool,
  getProduct,
  listCategories,
  suggestFollowUps,
  addToCart,
  checkout,
} from "./tools";

type ChatTools = InferUITools<{
  searchProducts: ReturnType<typeof createSearchProductsTool>;
  getProduct: typeof getProduct;
  listCategories: typeof listCategories;
  suggestFollowUps: typeof suggestFollowUps;
  addToCart: typeof addToCart;
  checkout: typeof checkout;
}>;

/** Fully-typed chat message with tool output shapes and persisted timestamp metadata. */
export type ChatUIMessage = UIMessage<{ createdAt?: number }, never, ChatTools>;
