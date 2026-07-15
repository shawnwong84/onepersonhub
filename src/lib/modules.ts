import { prisma } from "@/lib/prisma";
import { currentCompanyId } from "@/lib/tenant-context";
import { CORE_MODULE_SLUGS, findMarketplaceModule } from "@/lib/marketplace/catalog";

export async function getInstalledModule(slug: string) {
  const catalog = findMarketplaceModule(slug);
  if (!catalog) return null;

  const isCore = CORE_MODULE_SLUGS.includes(slug);
  const companyId = currentCompanyId();
  let moduleState = await prisma.businessModule.findUnique({
    where: { companyId_slug: { companyId, slug } },
  });

  // Core modules ship installed; heal any legacy row that says otherwise.
  if (moduleState && isCore && (!moduleState.isInstalled || !moduleState.isEnabled)) {
    moduleState = await prisma.businessModule.update({
      where: { companyId_slug: { companyId, slug } },
      data: { isInstalled: true, isEnabled: true, disabledAt: null },
    });
  }

  if (!moduleState && (catalog.isInstalled || isCore)) {
    moduleState = await prisma.businessModule.create({
      data: {
        companyId,
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
