"use client";

import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export function Progress({ className, indicatorClassName, value = 0 }: { className?: string; indicatorClassName?: string; value?: number }) {
  const safe = Math.min(100, Math.max(0, value));
  return <ProgressPrimitive.Root className={cn("relative h-2 w-full overflow-hidden rounded-full bg-elevated", className)} value={safe}><ProgressPrimitive.Indicator className={cn("h-full bg-accent transition-transform", indicatorClassName)} style={{ transform: `translateX(-${100 - safe}%)` }} /></ProgressPrimitive.Root>;
}
