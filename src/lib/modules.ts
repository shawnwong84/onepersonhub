import { prisma } from "@/lib/prisma";
import { findMarketplaceModule } from "@/lib/marketplace/catalog";

export async function getInstalledModule(slug: string) {
  const catalog = findMarketplaceModule(slug);
  if (!catalog) return null;

  let moduleState = await prisma.businessModule.findUnique({ where: { slug } });

  if (!moduleState && catalog.isInstalled) {
    moduleState = await prisma.businessModule.create({
      data: {
        slug,
        name: catalog.name,
        category: catalog.category,
        description: catalog.description,
        version: catalog.version,
        isInstalled: true,
        isEnabled: true,
        installedAt: new Date(),
        installedBy: "System",
        metadata: {
          channels: catalog.channels,
          workflows: catalog.workflows,
          records: catalog.records,
          approvals: catalog.approvals,
          reporterSignals: catalog.reporterSignals,
        },
      },
    });
  }

  if (!moduleState?.isInstalled) return null;
  return { catalog, module: moduleState };
}
