"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { LOGIN_CAROUSEL_SLIDES, type LoginCarouselSlide } from "@/lib/loginCarousel";
import styles from "./MobileBrandCarousel.module.css";

// Mobile-only brand stage. Purely presentational: it never authenticates or bypasses sign-in.
export function MobileBrandCarousel({
  slides = LOGIN_CAROUSEL_SLIDES,
  onComplete,
}: {
  slides?: LoginCarouselSlide[];
  onComplete: () => void;
}) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const slide = slides[index];
  const isFinalSlide = index === slides.length - 1;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") setIndex((current) => Math.min(current + 1, slides.length - 1));
      if (event.key === "ArrowLeft") setIndex((current) => Math.max(current - 1, 0));
      if (event.key === "Escape") onComplete();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slides.length, onComplete]);

  if (!slide) return null;

  function goToNext() {
    if (isFinalSlide) {
      onComplete();
      return;
    }
    setIndex((current) => Math.min(current + 1, slides.length - 1));
  }

  return (
    <section
      aria-label="DeployIQ product introduction"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-950 text-white md:hidden"
      onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        const end = event.changedTouches[0]?.clientX ?? null;
        if (start === null || end === null) return;
        const distance = end - start;
        if (Math.abs(distance) < 48) return;
        if (distance < 0) setIndex((current) => Math.min(current + 1, slides.length - 1));
        else setIndex((current) => Math.max(current - 1, 0));
      }}
    >
      <div className="relative h-[54dvh] min-h-0 flex-none overflow-hidden">
        {slide.image ? (
          <Image
            key={slide.id}
            src={slide.image}
            alt={slide.imageAlt}
            fill
            priority
            sizes="(max-width: 767px) 100vw, 0px"
            className={`${styles.wallpaper} object-cover object-center`}
          />
        ) : (
          <div
            key={slide.id}
            role="img"
            aria-label={slide.imageAlt}
            className={`${styles.wallpaper} absolute inset-0 bg-gradient-to-br ${slide.gradient}`}
          />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-transparent to-slate-950" />

        <div className="absolute inset-x-0 top-0 z-10 flex h-[calc(6rem+env(safe-area-inset-top))] items-start justify-end bg-gradient-to-b from-slate-950 via-slate-950/90 to-transparent px-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <p
            aria-label="DeployIQ trademark"
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xl font-black tracking-tight text-white"
          >
            <span>Deploy</span><span className="text-orange-500">IQ</span><span className="align-super text-[11px] text-white">&trade;</span>
          </p>
          <button
            type="button"
            onClick={onComplete}
            className="min-h-9 rounded-lg px-3 text-sm font-bold text-white/80 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            Skip
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="-mt-1">
          <p className={`text-[10px] font-black uppercase tracking-[0.24em] sm:text-[11px] ${slide.accent}`}>{slide.theme}</p>
          <h1 className="mt-2 text-2xl font-black leading-[1.08] min-[375px]:text-[1.7rem] sm:text-3xl">
            {slide.headline.map((line) => <span key={line} className="block">{line}</span>)}
          </h1>
          <p className="mt-2.5 max-w-md text-[13px] leading-5 text-white/75 sm:text-sm sm:leading-6">{slide.body}</p>
        </div>

        <div className="mt-auto pt-3">
          <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Carousel slides">
            {slides.map((item, slideIndex) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={slideIndex === index}
                aria-label={`Show slide ${slideIndex + 1}: ${item.theme}`}
                onClick={() => setIndex(slideIndex)}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${slideIndex === index ? "bg-orange-500" : "bg-white/30 hover:bg-white/60"}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={goToNext}
            className="mt-3 min-h-11 w-full rounded-lg bg-orange-500 px-4 text-sm font-black text-slate-950 transition hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-white sm:min-h-12"
          >
            {isFinalSlide ? "Continue to Sign In" : "Next"}
          </button>
        </div>
      </div>
    </section>
  );
}
