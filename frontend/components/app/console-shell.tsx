"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  DatabaseZap,
  FileInput,
  FileUser,
  LayoutDashboard,
  Menu,
  PlaySquare,
  Settings,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/applications", label: "Applications", icon: FileUser },
  { href: "/import-export", label: "Import / Export", icon: FileInput },
  { href: "/match-runs", label: "Match Runs", icon: PlaySquare },
  { href: "/settings-api-status", label: "Settings / API Status", icon: Settings },
];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { apiStatus, apiStatusLoading, refreshApiStatus } = useWorkspace();
  const current = navItems.find((item) => item.href === pathname) ?? navItems[0];
  const reachable = apiStatus.health === "reachable";

  return (
    <div className="console-grid min-h-screen">
      <button
        aria-label="Close navigation"
        className={cn("fixed inset-0 z-40 hidden bg-slate-950/40 backdrop-blur-sm", open && "block lg:hidden")}
        onClick={() => setOpen(false)}
        type="button"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[272px] -translate-x-full flex-col border-r border-border bg-slate-950 p-4 text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-teal-500 text-slate-950">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <div>
              <strong className="block text-sm">TalentConnect</strong>
              <span className="text-xs text-slate-300">Operations Console</span>
            </div>
          </div>
          <Button className="text-white hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} size="icon" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav aria-label="Primary navigation" className="mt-6 grid gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white",
                  active && "bg-white text-slate-950 hover:bg-white hover:text-slate-950",
                )}
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-border bg-background/88 backdrop-blur-xl">
          <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button aria-label="Open navigation" className="lg:hidden" onClick={() => setOpen(true)} size="icon" variant="outline">
                <Menu className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-muted-foreground">TalentConnect</p>
                <h1 className="truncate text-xl font-semibold tracking-tight">{current.label}</h1>
              </div>
            </div>
            <button
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground shadow-sm"
              onClick={() => void refreshApiStatus()}
              type="button"
            >
              {apiStatusLoading ? <Spinner /> : <span className={cn("h-2 w-2 rounded-full", reachable ? "bg-emerald-500" : "bg-red-500")} />}
              <span className="hidden sm:inline">API</span>
              <Badge variant={reachable ? "success" : "warning"}>{reachable ? "Reachable" : "Offline"}</Badge>
            </button>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
