import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-dashed border-border bg-background p-8 text-sm text-muted-foreground">
          This page is present in the navigation and will be completed in its assigned phase.
        </div>
      </CardContent>
    </Card>
  );
}
