interface AbstractArtworkProps {
  className?: string;
}

export function AbstractArtwork({ className }: AbstractArtworkProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="320" cy="70" r="70" className="fill-owly-primary/10" />
      <circle cx="320" cy="70" r="40" className="fill-owly-primary/15" />
      <rect x="20" y="220" width="120" height="120" rx="28" className="fill-owly-primary/[0.06]" />
      <path
        d="M40 60 L200 60 M40 60 L40 160"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-owly-primary/20"
      />
      <circle cx="200" cy="200" r="3" className="fill-owly-primary/40" />
      <circle cx="250" cy="240" r="3" className="fill-owly-primary/30" />
      <circle cx="180" cy="260" r="3" className="fill-owly-primary/25" />
      <path
        d="M40 340 C 120 300, 200 380, 300 320"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-owly-primary/15"
      />
    </svg>
  );
}
