import { ApplicationDetailsPageClient } from "@/components/applications/application-details-page-client";

type Props = {
  params: Promise<{ candidateId: string }>;
};

export default async function ApplicationDetailsPage({ params }: Props) {
  const { candidateId } = await params;
  return <ApplicationDetailsPageClient candidateId={candidateId} />;
}
