import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maskSettingsSecrets } from "@/lib/security";
import { updateSettingsSchema, validateBody } from "@/lib/validations";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "settings:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    let settings = await prisma.settings.findUnique({
      where: { companyId: auth.companyId },
    });

    if (!settings) {
      settings = await prisma.settings.create({
        data: { companyId: auth.companyId },
      });
    }

    return NextResponse.json(maskSettingsSecrets(settings));
  } catch (error) {
    logger.error("Failed to fetch settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request, "settings:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();

    // Remove fields that should not be updated directly
    delete body.companyId;
    delete body.createdAt;
    delete body.updatedAt;

    const validation = validateBody(updateSettingsSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const settings = await prisma.settings.upsert({
      where: { companyId: auth.companyId },
      update: validation.data,
      create: { companyId: auth.companyId, ...validation.data },
    });

    await logActivity({
      action: "settings.updated",
      entity: ACTIVITY_ENTITIES.SETTINGS,
      entityId: settings.companyId,
      description: "Updated system settings.",
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        fields: Object.keys(validation.data),
        tokenBudgetChanged:
          "dailyTokenBudget" in validation.data ||
          "monthlyTokenBudget" in validation.data ||
          "maxTokens" in validation.data,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(maskSettingsSecrets(settings));
  } catch (error) {
    logger.error("Failed to update settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
