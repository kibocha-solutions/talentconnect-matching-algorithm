"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SheetProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  className?: string;
};

export function Sheet({
  open,
  title,
  description,
  children,
  onOpenChange,
  className,
}: SheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid justify-items-end bg-slate-950/40 p-0 backdrop-blur-sm sm:p-4">
      <button
        aria-label="Close panel"
        className="absolute inset-0 cursor-default"
        onClick={() => onOpenChange(false)}
        type="button"
      />
      <aside
        className={cn(
          "relative z-10 flex h-full w-full flex-col overflow-hidden border-l border-border bg-card shadow-soft sm:max-w-2xl sm:rounded-md sm:border",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <Button aria-label="Close panel" onClick={() => onOpenChange(false)} size="icon" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </aside>
    </div>
  );
}
