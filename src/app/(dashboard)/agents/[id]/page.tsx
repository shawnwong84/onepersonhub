import { AgentsClient } from "../page";

interface AgentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { id } = await params;
  return <AgentsClient routeAgentId={id} />;
}
