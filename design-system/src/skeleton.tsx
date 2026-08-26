import type { HTMLAttributes } from "react";
import { cn } from "@pytorch-fit/design-system/merge-classes";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-elevated", className)} {...props} />;
}
