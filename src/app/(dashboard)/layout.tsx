import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ReporterChatWidget } from "@/components/reporter/chat-widget";
import { getBillingAccount, isBillingLocked } from "@/lib/billing/status";
import { getCurrentUser } from "@/lib/auth";
import { setCurrentCompany } from "@/lib/tenant-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // "/" is shared between the anonymous marketing landing page and the
  // authenticated dashboard (see page.tsx). An anonymous visitor gets the
  // landing page bare - no sidebar chrome, no billing gate, since neither
  // applies to a visitor who hasn't logged in yet.
  const user = await getCurrentUser();
  if (!user) {
    return <>{children}</>;
  }

  // Server Component pages under this layout (e.g. the dashboard homepage)
  // query the tenant-scoped `prisma` client directly, unlike API routes
  // where requireAuth() sets this - this is the equivalent entry point for
  // the page-rendering path.
  setCurrentCompany(user.companyId);

  // /billing itself lives in its own (billing) route group specifically so
  // this redirect never wraps it - redirecting from here to /billing would
  // otherwise loop.
  const account = await getBillingAccount(user.companyId);
  if (isBillingLocked(account)) {
    redirect("/billing");
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden pb-[52px] lg:pb-0">{children}</main>
      <MobileNav />
      <ReporterChatWidget />
    </div>
  );
}
