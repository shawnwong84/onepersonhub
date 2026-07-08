import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { workflowTemplates } from "@/lib/workflow-templates";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "automation:read");
  if (!isAuthenticated(auth)) return auth;

  return NextResponse.json({
    items: workflowTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      recommendedChannel: template.recommendedChannel,
      nodes: template.nodes,
      edges: template.edges,
      stepCount: Math.max(template.nodes.length - 1, 0),
    })),
  });
}
