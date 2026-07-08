import { Sidebar } from "@/components/layout/sidebar";
import { ReporterChatWidget } from "@/components/reporter/chat-widget";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
      <ReporterChatWidget />
    </div>
  );
}
