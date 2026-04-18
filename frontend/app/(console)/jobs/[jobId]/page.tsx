import { JobDetailsPageClient } from "@/components/jobs/job-details-page-client";

type Props = {
  params: Promise<{ jobId: string }>;
};

export default async function JobDetailsPage({ params }: Props) {
  const { jobId } = await params;
  return <JobDetailsPageClient jobId={jobId} />;
}
