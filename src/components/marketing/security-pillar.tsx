import { cn } from "@/lib/utils";

interface SecurityPillarProps {
  icon: React.ElementType;
  title: string;
  body: string;
  className?: string;
}

export function SecurityPillar({ icon: Icon, title, body, className }: SecurityPillarProps) {
  return (
    <div className={cn("rounded-2xl border border-owly-border bg-owly-surface p-6", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-owly-primary-50">
        <Icon className="h-5 w-5 text-owly-primary" strokeWidth={1.75} />
      </div>
      <h3 className="mt-4 font-semibold text-owly-text">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-owly-text-light">{body}</p>
    </div>
  );
}
