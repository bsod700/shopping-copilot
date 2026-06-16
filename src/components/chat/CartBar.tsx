"use client";

import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { useCart } from "./CartContext";

export function CartBar() {
  const { items, removeItem, setQuantity, clear, total } = useCart();

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="flex w-full items-center justify-end border-b bg-muted/50 px-4 py-2">
      <Sheet>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Your Cart</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4">
            {items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Your cart is empty.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {items.map((item) => (
                  <li key={item.productId} className="flex items-center gap-3 border-b pb-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">${item.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setQuantity(item.productId, item.quantity - 1)}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setQuantity(item.productId, item.quantity + 1)}
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="w-16 text-right text-sm font-medium">
                      ${(item.price * item.quantity).toFixed(2)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => removeItem(item.productId)}
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <SheetFooter className="flex-col gap-2 border-t pt-4">
            <div className="flex w-full items-center justify-between text-sm font-medium">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <SheetClose
              render={<Button className="w-full" disabled={items.length === 0} />}
              onClick={() => {
                clear();
                toast.success("Order placed!");
              }}
            >
              Checkout
            </SheetClose>
          </SheetFooter>
        </SheetContent>
        <SheetTrigger
          render={<Button variant="outline" size="icon" className="relative" aria-label="Open cart" />}
        >
          <ShoppingCart className="h-4 w-4" />
          <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground">
            {count}
          </span>
        </SheetTrigger>
      </Sheet>
    </div>
  );
}
