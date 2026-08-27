// Mobile login brand carousel configuration and presentation rules.
// Slides are data so product-communication slides can be inserted later without rebuilding the UI.

export type LoginCarouselSlide = {
  id: string;
  theme: string;
  headline: string[];
  body: string;
  // null renders the branded gradient fallback if an image is intentionally omitted.
  image: string | null;
  imageAlt: string;
  gradient: string;
  accent: string;
};

export const LOGIN_CAROUSEL_SLIDES: LoginCarouselSlide[] = [
  {
    id: "visibility",
    theme: "Visibility",
    headline: ["See Every Visit.", "Know Every Detail."],
    body: "Real-time visibility into field activities with accurate data, photos, GPS, and timestamps—captured at the source.",
    image: "/login-carousel/visibility-construction.webp",
    imageAlt: "Construction site supervisor verifying timestamped, GPS-tagged infrastructure progress on a tablet",
    gradient: "from-slate-950 via-slate-900 to-orange-950",
    accent: "text-blue-400",
  },
  {
    id: "accountability",
    theme: "Accountability",
    headline: ["Assign. Track. Approve.", "All in One Flow."],
    body: "Clear ownership and real-time tracking ensure tasks are completed right, evidence is verified, and nothing slips.",
    image: "/login-carousel/accountability-telecom.webp",
    imageAlt: "Telecom field engineer reviewing an assigned tower-site inspection through approval on a tablet",
    gradient: "from-slate-950 via-slate-900 to-slate-800",
    accent: "text-violet-300",
  },
  {
    id: "trust",
    theme: "Trust",
    headline: ["Verified Data.", "Trusted Decisions."],
    body: "Accurate, secure, and auditable data you can trust to make better decisions and drive results.",
    image: "/login-carousel/trust-retail.webp",
    imageAlt: "Field operative capturing verified evidence of a retail display installation with audit-trail details",
    gradient: "from-slate-950 via-orange-950 to-slate-900",
    accent: "text-emerald-400",
  },
];

export const LOGIN_CAROUSEL_SESSION_STORAGE_KEY = "deployiq:login-carousel-dismissed";
export const LEGACY_LOGIN_CAROUSEL_STORAGE_KEY = "deployiq:login-carousel-cycle";

export function isLoginCarouselAlwaysShown(flag: string | undefined, nodeEnv: string | undefined) {
  return nodeEnv !== "production" && flag === "1";
}

// A fresh browser session is eligible. Skip/completion suppresses only that session.
export function shouldShowLoginCarousel(sessionDismissedValue: string | null) {
  return sessionDismissedValue !== "1";
}
