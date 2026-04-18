"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-store";

export default function SettingsApiStatusPage() {
  const { apiStatus, apiStatusLoading, refreshApiStatus } = useWorkspace();

  return (
    <Card>
      <CardHeader className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Settings / API Status</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Operational status only. Secret-bearing configuration is not exposed.
          </p>
        </div>
        <Button onClick={() => void refreshApiStatus()} variant="outline">
          {apiStatusLoading ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <StatusItem label="API base URL" value={apiStatus.apiBaseUrl} />
        <StatusItem label="Backend" value={apiStatus.health} />
        <StatusItem label="Match endpoint" value={apiStatus.matchEndpoint} />
        <StatusItem label="Provider" value={apiStatus.provider ?? "Unavailable"} />
        <StatusItem label="Model status" value={apiStatus.modelStatus ?? "Unavailable"} />
        <StatusItem label="Last checked" value={apiStatus.checkedAt ? formatDateTime(apiStatus.checkedAt) : "Pending"} />
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <strong className="mt-2 block break-words text-base font-medium">{value}</strong>
    </div>
  );
}
