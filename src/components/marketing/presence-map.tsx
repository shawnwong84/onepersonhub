const MARKETS = [
  { name: "China", top: "12%", left: "58%" },
  { name: "Hong Kong", top: "34%", left: "63%" },
  { name: "Thailand", top: "48%", left: "42%" },
  { name: "Indonesia", top: "78%", left: "45%" },
  { name: "Malaysia", top: "64%", left: "40%" },
  { name: "Singapore", top: "72%", left: "37%" },
];

/**
 * A schematic, illustrative presence map, not a geographically precise one.
 * Markers are placed in roughly correct relative positions (China/Hong Kong
 * north, Thailand/Malaysia/Singapore along the peninsula, Indonesia south)
 * over an abstract dotted field rather than traced coastlines.
 */
export function PresenceMap() {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-xl overflow-hidden rounded-2xl border border-owly-border bg-owly-surface">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <pattern id="presence-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" className="fill-owly-border" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#presence-dots)" />
      </svg>

      {MARKETS.map((market) => (
        <div
          key={market.name}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ top: market.top, left: market.left }}
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full scale-[1.8] rounded-full bg-owly-primary/25" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-owly-primary ring-2 ring-owly-surface" />
          </span>
          <span className="mt-1.5 whitespace-nowrap rounded-full bg-owly-surface px-2 py-0.5 text-xs font-medium text-owly-text shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
            {market.name}
          </span>
        </div>
      ))}
    </div>
  );
}
