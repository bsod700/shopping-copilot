/**
 * @fileoverview Light/dark theme toggle button using `next-themes`.
 *
 * Switches between "light" and "dark" only (not cycling back to "system"), using
 * CSS class visibility (`dark:hidden` / `dark:block`) to swap Sun ↔ Moon icons
 * without a JS-driven conditional — avoids a hydration flash.
 */
"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}
