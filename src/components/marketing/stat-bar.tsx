"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";

const STATS = [
  { value: 6, suffix: "", label: "Markets served" },
  { value: 12, suffix: "", label: "Areas it watches" },
  { value: 3, suffix: "", label: "Channels monitored" },
  { value: 5, suffix: "", label: "Systems connected" },
];

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const duration = 900;
    const start = performance.now();
    let frame: number;
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value]);

  return <span ref={ref}>{display}</span>;
}

export function StatBar() {
  return (
    <section className="border-y border-owly-border bg-owly-surface">
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-8 px-4 py-10 sm:px-6 lg:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="text-center lg:text-left">
            <p className="text-3xl font-semibold tracking-tight text-owly-text md:text-4xl">
              <CountUp value={stat.value} />
              {stat.suffix}
            </p>
            <p className="mt-1 text-sm text-owly-text-light">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
