import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { CONNECTOR_PROVIDERS } from "@/lib/connectors/catalog";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "connectors:read");
  if (!isAuthenticated(auth)) return auth;

  return NextResponse.json({ providers: CONNECTOR_PROVIDERS });
}
