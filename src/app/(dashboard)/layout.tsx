import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ReporterChatWidget } from "@/components/reporter/chat-widget";

export default function DashboardLayout({
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
