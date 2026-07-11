import { cn } from "@/lib/utils";

// Deterministic (not random) palette assignment so the same customer always
// gets the same avatar color across renders/sessions.
const PALETTE = [
  "bg-owly-primary-50 text-owly-primary-dark dark:bg-owly-primary-100 dark:text-owly-primary-light",
  "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
];

function paletteIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % PALETTE.length;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface InitialsAvatarProps {
  name: string;
  seed?: string;
  size?: "sm" | "md";
  className?: string;
}

const sizeStyles = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
};

export function InitialsAvatar({ name, seed, size = "md", className }: InitialsAvatarProps) {
  const colorClass = PALETTE[paletteIndex(seed || name)];
  return (
    <div
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-full font-semibold",
        sizeStyles[size],
        colorClass,
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
