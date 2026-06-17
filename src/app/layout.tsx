/**
 * @fileoverview Root layout — wraps every page with theme, toast, and Web Vitals.
 *
 * `suppressHydrationWarning` on `<html>` is required because `next-themes` writes
 * the `class` attribute on the server differently than the client hydration pass
 * when the theme is "system" — without it, React logs a hydration mismatch warning.
 */
import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { WebVitals } from "@/components/WebVitals";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bazak Shopping Copilot",
  description: "AI-powered shopping assistant — find the best products through natural conversation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex h-screen flex-col overflow-hidden">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
          <WebVitals />
        </ThemeProvider>
      </body>
    </html>
  );
}
