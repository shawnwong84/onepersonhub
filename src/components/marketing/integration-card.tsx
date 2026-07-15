import { cn } from "@/lib/utils";

const AUTH_LABELS: Record<string, string> = {
  oauth2: "OAuth2",
  api_key: "API key",
  basic_auth: "Basic auth",
};

interface IntegrationCardProps {
  icon: React.ElementType;
  name: string;
  description: string;
  authType?: string;
  className?: string;
}

export function IntegrationCard({ icon: Icon, name, description, authType, className }: IntegrationCardProps) {
  return (
    <div className={cn("flex flex-col rounded-2xl border border-owly-border bg-owly-surface p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-owly-primary-50">
          <Icon className="h-5 w-5 text-owly-primary" strokeWidth={1.75} />
        </div>
        {authType && (
          <span className="rounded-full border border-owly-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-owly-text-light">
            {AUTH_LABELS[authType] || authType}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-semibold text-owly-text">{name}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-owly-text-light">{description}</p>
    </div>
  );
}
