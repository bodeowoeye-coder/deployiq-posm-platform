"use client";

import Image from "next/image";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileCheck2, Images, MapPin } from "lucide-react";
import { useState } from "react";
import { LOGIN_CAROUSEL_SLIDES } from "@/lib/loginCarousel";

const STORY_EVIDENCE = {
  visibility: {
    items: [
      { icon: MapPin, label: "GPS location", value: "6.5240° N, 3.3792° E" },
      { icon: Clock3, label: "Timestamp", value: "Today, 10:42 AM" },
      { icon: Images, label: "Photo evidence", value: "3 site photos verified" },
    ],
    notice: "Site progress evidence captured",
    detail: "Location, time and photos are ready for review.",
  },
  accountability: {
    items: [
      { icon: CheckCircle2, label: "Assigned", value: "Tower inspection" },
      { icon: Images, label: "Evidence submitted", value: "10:27 AM" },
      { icon: FileCheck2, label: "Review status", value: "Approved" },
    ],
    notice: "Field task approved",
    detail: "The complete assignment trail is available remotely.",
  },
  trust: {
    items: [
      { icon: MapPin, label: "Location", value: "Retail asset verified" },
      { icon: Clock3, label: "Date & time", value: "Today, 11:18 AM" },
      { icon: FileCheck2, label: "Audit trail", value: "Evidence verified" },
    ],
    notice: "Submission verified",
    detail: "Trusted field evidence has been added to the audit trail.",
  },
} as const;

// Tablet/desktop product storytelling only. Authentication remains owned by the login page.
export function DesktopBrandStories() {
  const [index, setIndex] = useState(0);
  const slide = LOGIN_CAROUSEL_SLIDES[index];
  const evidence = slide ? STORY_EVIDENCE[slide.id as keyof typeof STORY_EVIDENCE] : null;

  if (!slide || !evidence) return null;

  function showPrevious() {
    setIndex((current) => (current - 1 + LOGIN_CAROUSEL_SLIDES.length) % LOGIN_CAROUSEL_SLIDES.length);
  }

  function showNext() {
    setIndex((current) => (current + 1) % LOGIN_CAROUSEL_SLIDES.length);
  }

  return (
    <aside
      aria-label="DeployIQ product stories"
      className="relative hidden min-h-0 overflow-hidden bg-slate-950 text-white md:block"
    >
      {LOGIN_CAROUSEL_SLIDES.map((item, slideIndex) => item.image ? (
        <Image
          key={item.id}
          src={item.image}
          alt=""
          fill
          loading="lazy"
          sizes="(min-width: 1536px) 78vw, (min-width: 1280px) 74vw, (min-width: 1024px) 66vw, 100vw"
          className={`object-cover object-center transition-opacity duration-300 ${slideIndex === index ? "opacity-100" : "opacity-0"}`}
        />
      ) : (
        <div
          key={item.id}
          aria-hidden
          className={`absolute inset-0 bg-gradient-to-br transition-opacity duration-300 ${item.gradient} ${slideIndex === index ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div aria-hidden className="absolute inset-0 bg-slate-950/45" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-slate-950/35 via-slate-950/10 to-slate-950/85" />

      <div className="absolute right-8 top-8 hidden w-64 space-y-2 xl:block 2xl:right-12 2xl:top-12 2xl:w-72" aria-label={`${slide.theme} field evidence`}>
        {evidence.items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3 shadow-xl backdrop-blur-md">
            <Icon aria-hidden className="shrink-0 text-emerald-400" size={20} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">{label}</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-white/90">{value}</p>
            </div>
            <span aria-hidden className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          </div>
        ))}
      </div>

      <div className="absolute bottom-12 right-8 hidden max-w-sm items-center gap-3 rounded-xl border border-white/15 bg-white/95 px-4 py-3 text-slate-950 shadow-2xl 2xl:flex 2xl:right-12">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><FileCheck2 aria-hidden size={18} /></span>
        <div>
          <p className="text-sm font-bold">{evidence.notice}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{evidence.detail}</p>
        </div>
      </div>

      <div className="relative flex h-full min-h-0 flex-col justify-end p-8 lg:p-12 xl:p-14 2xl:p-16">
        <div className="max-w-xl" aria-live="polite">
          <p className={`text-xs font-black uppercase tracking-[0.28em] ${slide.accent}`}>{slide.theme}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight lg:text-4xl">
            {slide.headline.map((line) => <span key={line} className="block">{line}</span>)}
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-white/75 lg:text-base lg:leading-7">{slide.body}</p>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-white/15 pt-5 lg:mt-8 2xl:max-w-xl">
          <div className="flex items-center gap-2" role="tablist" aria-label="Product stories">
            {LOGIN_CAROUSEL_SLIDES.map((item, slideIndex) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={slideIndex === index}
                aria-label={`Show ${item.theme} story`}
                onClick={() => setIndex(slideIndex)}
                className={`h-2.5 rounded-full transition-[width,color] ${slideIndex === index ? "w-8 bg-orange-500" : "w-2.5 bg-white/35 hover:bg-white/60"}`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={showPrevious}
              aria-label="Previous product story"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-slate-950/30 text-white transition hover:border-white/40 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <ChevronLeft aria-hidden size={18} />
            </button>
            <button
              type="button"
              onClick={showNext}
              aria-label="Next product story"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-slate-950/30 text-white transition hover:border-white/40 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <ChevronRight aria-hidden size={18} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
