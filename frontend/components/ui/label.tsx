import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Label({
  className,
  error,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { error?: ReactNode }) {
  return (
    <label className={cn("grid gap-2 text-sm font-medium text-foreground", className)} {...props}>
      {children}
      {error ? <span className="text-xs font-medium text-destructive">{error}</span> : null}
    </label>
  );
}
