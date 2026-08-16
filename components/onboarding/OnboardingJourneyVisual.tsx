"use client";

import Image from "next/image";
import { ShieldCheck, Target, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { LOGIN_CAROUSEL_SLIDES } from "@/lib/loginCarousel";

export type OnboardingJourneyContext = "goal" | "requirements";

type OnboardingStory = { eyebrow: string; headline: string; body: string };

const STORY_ROTATION_MS = 7_000;

const STORIES: Record<OnboardingJourneyContext, OnboardingStory[]> = {
  goal: [
    {
      eyebrow: "Get Started",
      headline: "Start your journey to a smarter workspace.",
      body: "Tell us what you want to achieve and DeployIQ will help identify the right solution for your programme.",
    },
    {
      eyebrow: "Built Around Your Goal",
      headline: "One platform. Different field operations.",
      body: "From retail visibility and construction monitoring to fleet branding, audits and asset verification, DeployIQ adapts to the outcome you want to achieve.",
    },
    {
      eyebrow: "Intelligent Recommendation",
      headline: "Tell us the goal. We’ll shape the solution.",
      body: "DeployIQ uses your operational objective to recommend the right workspace, capabilities and commercial path.",
    },
  ],
  requirements: [
    {
      eyebrow: "Configure",
      headline: "Build the right workspace around your needs.",
      body: "Tell us where, how and at what scale you operate so DeployIQ can configure the right capabilities and commercial plan.",
    },
    {
      eyebrow: "Scale",
      headline: "Built for the size of your operation.",
      body: "Whether you're managing hundreds or thousands of locations, assets or field activities, DeployIQ can scale the workspace around your programme.",
    },
    {
      eyebrow: "Tailored",
      headline: "Only the capabilities your programme needs.",
      body: "Your industry, deployment scale, team and operational requirements help DeployIQ recommend a workspace configured for the way you work.",
    },
  ],
};

export function OnboardingJourneyVisual({ context }: { context: OnboardingJourneyContext }) {
  const [storyIndexes, setStoryIndexes] = useState<Record<OnboardingJourneyContext, number>>({ goal: 0, requirements: 0 });
  const [manualSelectionVersion, setManualSelectionVersion] = useState(0);
  const stories = STORIES[context];
  const storyIndex = storyIndexes[context];

  function selectStory(index: number) {
    setStoryIndexes((current) => ({ ...current, [context]: index }));
    setManualSelectionVersion((current) => current + 1);
  }

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: number | undefined;
    const startRotation = () => {
      if (timer) window.clearInterval(timer);
      if (document.hidden) return;
      timer = window.setInterval(() => {
        setStoryIndexes((current) => ({
          ...current,
          [context]: (current[context] + 1) % stories.length,
        }));
      }, STORY_ROTATION_MS);
    };
    startRotation();
    document.addEventListener("visibilitychange", startRotation);
    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", startRotation);
    };
  }, [context, storyIndex, stories.length, manualSelectionVersion]);

  return (
    <aside className="relative isolate overflow-hidden bg-slate-950 px-7 py-9 text-white sm:px-10 lg:min-h-[42rem] lg:px-10 lg:py-12">
      {LOGIN_CAROUSEL_SLIDES.map((story, index) => story.image ? (
        <Image
          key={story.id}
          src={story.image}
          alt=""
          fill
          priority={index === 0}
          loading={index === 0 ? "eager" : "lazy"}
          sizes="(min-width: 1024px) 42vw, 100vw"
          className={`-z-20 object-cover object-center transition-opacity duration-300 motion-reduce:transition-none ${index === storyIndex ? "opacity-100" : "opacity-0"}`}
        />
      ) : null)}
      <div aria-hidden className="absolute inset-0 -z-10 bg-slate-950/70" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/35 via-slate-950/60 to-slate-950/95" />
      <div className="flex h-full flex-col">
        <div className="text-2xl font-black tracking-tight" aria-label="DeployIQ trademark">
          <span className="text-white">Deploy</span><span className="text-orange-500">IQ</span><span className="align-super text-[10px] text-white">&trade;</span>
        </div>
        <div className="relative mt-12 min-h-[17rem] max-w-md lg:mt-16" aria-live="polite">
          {stories.map((story, index) => (
            <div
              key={`${context}-${story.headline}`}
              aria-hidden={index !== storyIndex}
              className={`absolute inset-x-0 top-0 transition-opacity duration-500 motion-reduce:transition-none ${index === storyIndex ? "opacity-100" : "pointer-events-none opacity-0"}`}
            >
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-400">{story.eyebrow}</p>
              <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl lg:text-[2.65rem]">{story.headline}</h1>
              <p className="mt-5 text-sm leading-6 text-slate-200 sm:text-base sm:leading-7">{story.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-7 flex items-center gap-2" role="tablist" aria-label="Get Started stories">
          {LOGIN_CAROUSEL_SLIDES.map((story, index) => (
            <button
              key={story.id}
              type="button"
              role="tab"
              aria-selected={index === storyIndex}
              aria-label={`Show ${story.theme} background`}
              onClick={() => selectStory(index)}
              className={`h-2 rounded-full transition-[width,color] ${index === storyIndex ? "w-8 bg-orange-500" : "w-2 bg-white/40 hover:bg-white/70"}`}
            />
          ))}
        </div>
        <div className="mt-7 grid gap-3 lg:mt-auto">
          {[
            { icon: Target, title: "Tailored recommendations", detail: "The right solution for your rollout." },
            { icon: TrendingUp, title: "Scalable for your growth", detail: "Built to adapt as your programme evolves." },
            { icon: ShieldCheck, title: "Secure and reliable", detail: "Your setup and progress stay protected." },
          ].map(({ icon: Icon, title, detail }) => (
            <div key={title} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-3.5 backdrop-blur-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-300"><Icon aria-hidden size={20} /></span>
              <div><p className="text-sm font-bold">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-300">{detail}</p></div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
