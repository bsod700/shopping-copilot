import type { UIMessage, InferUITools } from "ai";
import type {
  searchProducts,
  getProduct,
  listCategories,
  suggestFollowUps,
  addToCart,
  checkout,
} from "./tools";

type ChatTools = InferUITools<{
  searchProducts: typeof searchProducts;
  getProduct: typeof getProduct;
  listCategories: typeof listCategories;
  suggestFollowUps: typeof suggestFollowUps;
  addToCart: typeof addToCart;
  checkout: typeof checkout;
}>;

export type ChatUIMessage = UIMessage<{ createdAt?: number }, never, ChatTools>;
