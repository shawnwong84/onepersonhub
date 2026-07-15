import { cn } from "@/lib/utils";

interface FeatureDetailCardProps {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  body: string;
  points?: string[];
  className?: string;
}

export function FeatureDetailCard({ icon: Icon, eyebrow, title, body, points, className }: FeatureDetailCardProps) {
  return (
    <div className={cn("rounded-2xl border border-owly-border bg-owly-surface p-6 sm:p-8", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-owly-primary-50">
        <Icon className="h-5 w-5 text-owly-primary" strokeWidth={1.75} />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">{eyebrow}</p>
      <h3 className="mt-1.5 text-lg font-semibold text-owly-text">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-owly-text-light">{body}</p>
      {points && points.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm text-owly-text-light">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-owly-text-light" />
              {point}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
