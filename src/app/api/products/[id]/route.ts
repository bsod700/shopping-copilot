/**
 * @fileoverview Single-product detail REST endpoint.
 *
 * GET /api/products/[id] — proxy to DummyJSON `/products/{id}` and return the
 * full `ProductDetail` shape. Called by `ProductDetailSheet` when the user clicks
 * a product card to view warranty, stock, reviews, and full image gallery.
 *
 * Note: `params` is a Promise in Next.js 16 App Router — it must be awaited before use.
 */
import { getProduct } from "@/lib/dummyjson";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getProduct(Number(id));
  return Response.json(result);
}
