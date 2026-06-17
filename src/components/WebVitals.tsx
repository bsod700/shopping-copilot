/**
 * @fileoverview Web Vitals reporter — logs CWV metrics to the console in development.
 *
 * Uses Next.js's `useReportWebVitals` hook which captures LCP, FID, CLS, FCP, and TTFB.
 * In production these would be forwarded to an analytics endpoint; for this project
 * console logging is sufficient to satisfy the Lighthouse/Web Vitals audit requirement.
 * Renders nothing — purely a side-effect component mounted once in the root layout.
 */
"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitals() {
  useReportWebVitals((metric) => {
    console.log(`[web-vitals] ${metric.name}:`, metric.value);
  });

  return null;
}
