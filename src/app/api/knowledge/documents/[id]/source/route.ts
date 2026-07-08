import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { readObject } from "@/lib/object-storage";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "knowledge:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const document = await prisma.knowledgeDocument.findUnique({
      where: { id },
    });

    if (!document || !document.storageKey) {
      return NextResponse.json(
        { error: "Source file not found" },
        { status: 404 }
      );
    }

    const buffer = await readObject({
      bucket: document.storageBucket,
      key: document.storageKey,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": document.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(
          document.fileName || document.title
        )}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    logger.error("Failed to fetch source document:", error);
    return NextResponse.json(
      { error: "Failed to fetch source document" },
      { status: 500 }
    );
  }
}
