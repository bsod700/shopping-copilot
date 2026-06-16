"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitals() {
  useReportWebVitals((metric) => {
    console.log(`[web-vitals] ${metric.name}:`, metric.value);
  });

  return null;
}
