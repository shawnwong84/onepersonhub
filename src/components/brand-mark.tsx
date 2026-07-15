import { cn } from "@/lib/utils";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/** Paperhuman logo mark: a "P" monogram with its top-right corner folded
 * like a page, plus a small spark accent for the AI theme. Used everywhere
 * the app needs a logo - matches the mark already used in the sidebar
 * header. */
export function BrandMark({ size = 40, className }: BrandMarkProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-lg bg-owly-primary",
        className
      )}
    >
      <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" aria-hidden="true">
        <path d="M6 5H9V19H6V5Z" fill="white" />
        <path d="M9 5H15L17 7V9C17 10.66 15.66 12 14 12H9V5Z" fill="white" />
        <circle cx="19.25" cy="4.75" r="1.4" fill="white" fillOpacity="0.85" />
      </svg>
    </div>
  );
}
