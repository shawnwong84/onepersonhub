interface PhotoBandProps {
  src: string;
  alt: string;
  eyebrow: string;
  caption: string;
  className?: string;
}

/** Full-bleed editorial photo with a bottom gradient scrim and overlaid caption. */
export function PhotoBand({ src, alt, eyebrow, caption, className }: PhotoBandProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-owly-border ${className || ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-[320px] w-full object-cover sm:h-[400px]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80">{eyebrow}</p>
        <p className="mt-1.5 max-w-[42ch] text-lg font-medium leading-snug text-white sm:text-xl">{caption}</p>
      </div>
    </div>
  );
}
