import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ReporterChatWidget } from "@/components/reporter/chat-widget";

// Identical shell to (dashboard)/layout.tsx, deliberately kept in its own
// route group: (dashboard)/layout.tsx redirects to /billing when the
// subscription is locked, and /billing must stay reachable regardless of
// lock state or that redirect would loop against itself.
export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden pb-[52px] lg:pb-0">{children}</main>
      <MobileNav />
      <ReporterChatWidget />
    </div>
  );
}
