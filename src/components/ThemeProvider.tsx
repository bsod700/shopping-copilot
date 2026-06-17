/**
 * @fileoverview Thin client wrapper around `next-themes` ThemeProvider.
 *
 * Required because `next-themes` uses React context internally, which means it must
 * be a Client Component. This wrapper lets the root layout (a Server Component) import
 * and use it without converting the whole layout to a Client Component.
 */
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
