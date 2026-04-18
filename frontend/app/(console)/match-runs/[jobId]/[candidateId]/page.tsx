import { MatchResultPageClient } from "@/components/match-runs/match-result-page-client";

type Props = {
  searchParams: Promise<{ detail?: string }>;
};

export default async function MatchResultPage({ searchParams }: Props) {
  const { detail } = await searchParams;
  return <MatchResultPageClient detailParam={detail} />;
}
