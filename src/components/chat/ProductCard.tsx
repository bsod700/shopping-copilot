import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import type { Product } from "@/lib/types";

export function ProductCard({
  product,
  onSelect,
}: {
  product: Product;
  onSelect?: (product: Product) => void;
}) {
  const hasDiscount = product.discountPercentage > 0;
  const discountedPrice = hasDiscount
    ? product.price * (1 - product.discountPercentage / 100)
    : product.price;

  return (
    <Card
      data-testid="product-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(product)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect?.(product);
      }}
      className="w-full max-w-[220px] cursor-pointer transition-colors hover:bg-muted/50"
    >
      <Image
        src={product.thumbnail}
        alt={product.title}
        width={200}
        height={200}
        className="aspect-square w-full object-cover"
      />
      <CardHeader>
        <CardTitle className="line-clamp-1">{product.title}</CardTitle>
        <CardDescription className="line-clamp-2">
          {product.description}
        </CardDescription>
        {product.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {product.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        {hasDiscount ? (
          <>
            <span className="text-sm text-muted-foreground line-through">
              ${product.price.toFixed(2)}
            </span>
            <span className="font-medium">${discountedPrice.toFixed(2)}</span>
            <Badge variant="destructive">-{product.discountPercentage.toFixed(0)}%</Badge>
          </>
        ) : (
          <span className="font-medium">${product.price.toFixed(2)}</span>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
        <span>⭐ {product.rating.toFixed(1)}</span>
        <span>{product.availabilityStatus}</span>
      </CardFooter>
    </Card>
  );
}
