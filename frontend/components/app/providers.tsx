"use client";

import { Toaster } from "sonner";
import { WorkspaceProvider } from "@/lib/workspace-store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      {children}
      <Toaster closeButton position="top-right" richColors />
    </WorkspaceProvider>
  );
}
