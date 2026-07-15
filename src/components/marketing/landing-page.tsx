import { MarketingNav } from "@/components/marketing/nav";
import { Hero } from "@/components/marketing/hero";
import { StatBar } from "@/components/marketing/stat-bar";
import { PartnersSection } from "@/components/marketing/partners-section";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { SolutionsSection } from "@/components/marketing/solutions-section";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PhotoBand } from "@/components/marketing/photo-band";
import { Reveal } from "@/components/marketing/reveal";
import { ModuleDeepDive } from "@/components/marketing/module-deep-dive";
import { CtaBand } from "@/components/marketing/cta-band";
import { MarketingFooter } from "@/components/marketing/footer";

export function LandingPage() {
  return (
    <div className="min-h-full bg-owly-bg">
      <MarketingNav />
      <Hero />
      <StatBar />
      <PartnersSection />
      <HowItWorks />
      <SolutionsSection />
      <FeatureGrid />
      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <PhotoBand
            src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1600&auto=format&fit=crop&q=80"
            alt="A small business owner serving a customer at the counter"
            eyebrow="Every conversation, handled"
            caption="Built for the small teams actually answering the messages."
          />
        </Reveal>
      </section>
      <ModuleDeepDive />
      <CtaBand />
      <MarketingFooter />
    </div>
  );
}
