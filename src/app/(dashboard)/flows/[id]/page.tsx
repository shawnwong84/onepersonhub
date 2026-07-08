import { FlowsPageClient } from "../page";

export default async function FlowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FlowsPageClient initialFlowId={id} />;
}
