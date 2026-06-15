import { getProduct } from "@/lib/dummyjson";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getProduct(Number(id));
  return Response.json(result);
}
