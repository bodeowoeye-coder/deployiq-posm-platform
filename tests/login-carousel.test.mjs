import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  isLoginCarouselAlwaysShown,
  LOGIN_CAROUSEL_SLIDES,
  LOGIN_CAROUSEL_SESSION_STORAGE_KEY,
  LEGACY_LOGIN_CAROUSEL_STORAGE_KEY,
  shouldShowLoginCarousel,
} from "../lib/loginCarousel.ts";
import {
  persistRememberedLoginEmail,
  readRememberedLoginEmail,
  REMEMBERED_LOGIN_EMAIL_KEY,
} from "../lib/loginPreferences.ts";

const carousel = () => readFileSync(new URL("../components/login/MobileBrandCarousel.tsx", import.meta.url), "utf8");
const carouselStyles = () => readFileSync(new URL("../components/login/MobileBrandCarousel.module.css", import.meta.url), "utf8");
const desktopStories = () => readFileSync(new URL("../components/login/DesktopBrandStories.tsx", import.meta.url), "utf8");
const loginPage = () => readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const loginPreferences = () => readFileSync(new URL("../lib/loginPreferences.ts", import.meta.url), "utf8");

test("carousel renders the three configured brand slides with the approved copy", () => {
  assert.equal(LOGIN_CAROUSEL_SLIDES.length, 3);
  assert.deepEqual(LOGIN_CAROUSEL_SLIDES.map((slide) => slide.theme), ["Visibility", "Accountability", "Trust"]);

  const [visibility, accountability, trust] = LOGIN_CAROUSEL_SLIDES;
  assert.deepEqual(visibility.headline, ["See Every Visit.", "Know Every Detail."]);
  assert.equal(visibility.body, "Real-time visibility into field activities with accurate data, photos, GPS, and timestamps—captured at the source.");
  assert.deepEqual(accountability.headline, ["Assign. Track. Approve.", "All in One Flow."]);
  assert.equal(accountability.body, "Clear ownership and real-time tracking ensure tasks are completed right, evidence is verified, and nothing slips.");
  assert.deepEqual(trust.headline, ["Verified Data.", "Trusted Decisions."]);
  assert.equal(trust.body, "Accurate, secure, and auditable data you can trust to make better decisions and drive results.");

  for (const slide of LOGIN_CAROUSEL_SLIDES) {
    assert.match(slide.image, /^\/login-carousel\/[a-z-]+\.webp$/);
    assert.equal(existsSync(new URL(`../public${slide.image}`, import.meta.url)), true, `${slide.id} image must exist`);
    assert.ok(slide.gradient.startsWith("from-"), `${slide.id} needs a brand gradient placeholder`);
    assert.ok(slide.imageAlt.length > 10, `${slide.id} needs descriptive alt text`);
  }
});

test("slides use optimized responsive images with an accessible fallback", () => {
  const source = carousel();
  assert.match(source, /import Image from "next\/image"/);
  assert.match(source, /slide\.image \? \(/);
  assert.match(source, /sizes="\(max-width: 767px\) 100vw, 0px"/);
  assert.match(source, /alt=\{slide\.imageAlt\}/);
  assert.match(source, /role="img"\s+aria-label=\{slide\.imageAlt\}/);
  assert.match(source, /bg-gradient-to-br \$\{slide\.gradient\}/);
});

test("active wallpaper fades beneath the fixed navy treatment and respects reduced motion", () => {
  const source = carousel();
  const styles = carouselStyles();
  assert.match(source, /key=\{slide\.id\}/);
  assert.match(source, /styles\.wallpaper/);
  assert.match(styles, /animation: wallpaper-fade-in 400ms ease-out both/);
  assert.match(styles, /@keyframes wallpaper-fade-in/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /animation: none/);
  assert.match(source, /bg-gradient-to-b from-slate-950\/30 via-transparent to-slate-950/);
});

test("live DeployIQ trademark is centered with the approved color split", () => {
  const source = carousel();
  assert.match(source, /aria-label="DeployIQ trademark"/);
  assert.match(source, /absolute left-1\/2 -translate-x-1\/2 whitespace-nowrap/);
  assert.match(source, /whitespace-nowrap text-xl font-black/);
  assert.match(source, /<span>Deploy<\/span><span className="text-orange-500">IQ<\/span><span className="align-super text-\[11px\] text-white">&trade;<\/span>/);
  assert.match(source, /flex[^"\n]*items-start justify-end/);
});

test("wordmark and Skip sit in a protected navy header zone", () => {
  const source = carousel();
  assert.match(source, /h-\[calc\(6rem\+env\(safe-area-inset-top\)\)\]/);
  assert.match(source, /bg-gradient-to-b from-slate-950 via-slate-950\/90 to-transparent/);
  assert.match(source, /z-10 flex/);
  assert.match(source, /pt-\[max\(1rem,env\(safe-area-inset-top\)\)\]/);
});

test("slide content is configurable rather than hardcoded in the component", () => {
  const source = carousel();
  // The component accepts slides as a prop and defaults to the configured array.
  assert.match(source, /slides = LOGIN_CAROUSEL_SLIDES/);
  assert.match(source, /slides\?: LoginCarouselSlide\[\]/);
  // No slide copy is inlined in the component.
  assert.doesNotMatch(source, /See Every Visit|Assign\. Track\. Approve|Verified Data/);
});

test("Skip is present on every slide and opens the sign-in stage", () => {
  const source = carousel();
  // Skip lives in the persistent header, not inside a per-slide branch.
  assert.match(source, /<button\s+type="button"\s+onClick=\{onComplete\}[\s\S]{0,220}Skip/);
  assert.match(loginPage(), /<MobileBrandCarousel onComplete=\{dismissBrandCarousel\} \/>/);
  assert.match(loginPage(), /function dismissBrandCarousel\(\) \{[\s\S]*?sessionStorage\.setItem\(LOGIN_CAROUSEL_SESSION_STORAGE_KEY, "1"\)[\s\S]*?setCarouselState\("hide"\);\s*\}/);
});

test("final slide upgrades the CTA and completing the carousel opens sign-in", () => {
  const source = carousel();
  assert.match(source, /const isFinalSlide = index === slides\.length - 1/);
  assert.match(source, /\{isFinalSlide \? "Continue to Sign In" : "Next"\}/);
  assert.match(source, /if \(isFinalSlide\) \{\s*onComplete\(\);\s*return;\s*\}/);
});

test("fresh mobile browser session is eligible for the carousel", () => {
  assert.equal(shouldShowLoginCarousel(null), true);
});

test("skip and completion suppress the carousel for the active browser session", () => {
  assert.equal(shouldShowLoginCarousel("1"), false);
  const source = loginPage();
  assert.match(source, /window\.sessionStorage\.setItem\(LOGIN_CAROUSEL_SESSION_STORAGE_KEY, "1"\)/);
  assert.match(source, /<MobileBrandCarousel onComplete=\{dismissBrandCarousel\} \/>/);
  assert.match(carousel(), /onClick=\{onComplete\}[\s\S]{0,220}Skip/);
  assert.match(carousel(), /if \(isFinalSlide\) \{\s*onComplete\(\)/);
});

test("a future browser session becomes eligible again", () => {
  assert.equal(shouldShowLoginCarousel(null), true);
  assert.equal(LOGIN_CAROUSEL_SESSION_STORAGE_KEY, "deployiq:login-carousel-dismissed");
});

test("local/test override always shows the carousel but production ignores it", () => {
  assert.equal(isLoginCarouselAlwaysShown("1", "development"), true);
  assert.equal(isLoginCarouselAlwaysShown("1", "test"), true);
  assert.equal(isLoginCarouselAlwaysShown("0", "development"), false);
  assert.equal(isLoginCarouselAlwaysShown(undefined, "development"), false);
  assert.equal(isLoginCarouselAlwaysShown("1", "production"), false);

  const source = loginPage();
  assert.match(source, /process\.env\.NEXT_PUBLIC_DEPLOYIQ_ALWAYS_SHOW_LOGIN_CAROUSEL/);
  assert.match(source, /alwaysShowCarousel \|\| shouldShowLoginCarousel\(sessionDismissed\)/);
  assert.match(source, /setCarouselState\("show"\)/);
});

test("only an explicit same-session dismissal suppresses the carousel", () => {
  for (const value of [null, "", "0", "true", "not-a-number"]) {
    assert.equal(shouldShowLoginCarousel(value), true);
  }
});

test("legacy persistent cycle state cannot suppress the carousel", () => {
  assert.equal(LEGACY_LOGIN_CAROUSEL_STORAGE_KEY, "deployiq:login-carousel-cycle");
  const source = loginPage();
  assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem)\(LOGIN_CAROUSEL/);
  assert.doesNotMatch(source, /deployiq:login-carousel-cycle/);
  assert.match(source, /window\.sessionStorage\.getItem\(LOGIN_CAROUSEL_SESSION_STORAGE_KEY\)/);
  // Storage failures show the presentation and never block sign-in.
  assert.match(source, /\} catch \{\s*setCarouselState\("show"\);\s*\}/);
});

test("mobile initial render is explicitly unresolved and masks the sign-in form", () => {
  const source = loginPage();
  assert.match(source, /type LoginCarouselState = "pending" \| "show" \| "hide"/);
  assert.match(source, /useState<LoginCarouselState>\("pending"\)/);
  assert.match(source, /carouselState === "pending"/);
  assert.match(source, /aria-label="Preparing DeployIQ introduction"/);
  assert.match(source, /fixed inset-0 z-50[\s\S]{0,180}bg-slate-950[\s\S]{0,100}md:hidden/);
  assert.match(source, /carouselState === "show" \? <MobileBrandCarousel/);
  assert.doesNotMatch(source, /setTimeout\([\s\S]{0,120}(?:carousel|Carousel)/);
});

test("the carousel never authenticates or bypasses sign-in", () => {
  const source = carousel();
  assert.doesNotMatch(source, /\/api\/auth|signInWithPassword|createBrowserSupabase|router\.(push|replace)/);
  assert.doesNotMatch(source, /password|session/i);
});

test("existing authentication submit path and role routing are untouched", () => {
  const source = loginPage();
  assert.match(source, /<form className="mt-8 grid gap-5" onSubmit=\{handleSubmit\}>/);
  assert.match(source, /await fetch\("\/api\/auth\/session"/);
  // Destination still comes from the server response, not from the login page.
  assert.match(source, /redirectTo/);
  assert.doesNotMatch(source, /select role|Select your role|roleSelection/i);
});

test("mobile carousel hands off to the tablet and desktop login at the md breakpoint", () => {
  assert.match(carousel(), /fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-950 text-white md:hidden/);
  assert.match(loginPage(), /md:grid md:h-\[100dvh\] md:grid-rows-\[55%_45%\][\s\S]{0,100}lg:grid-cols-\[34%_66%\] lg:grid-rows-1 xl:grid-cols-\[26%_74%\] 2xl:grid-cols-\[22%_78%\]/);
  assert.match(loginPage(), /<div className="md:hidden"><BrandMark \/><\/div>/);
});

test("tablet and desktop storytelling reuses slide data with manual lightweight controls", () => {
  const source = desktopStories();
  assert.match(source, /LOGIN_CAROUSEL_SLIDES/);
  assert.match(source, /aria-label="DeployIQ product stories"/);
  assert.match(source, /relative hidden min-h-0 overflow-hidden bg-slate-950 text-white md:block/);
  assert.match(source, /sizes="\(min-width: 1536px\) 78vw, \(min-width: 1280px\) 74vw, \(min-width: 1024px\) 66vw, 100vw"/);
  assert.match(source, /LOGIN_CAROUSEL_SLIDES\.map\(\(item, slideIndex\)/);
  assert.match(source, /loading="lazy"/);
  assert.match(source, /slideIndex === index \? "opacity-100" : "opacity-0"/);
  assert.match(source, /bg-slate-950\/45/);
  assert.match(source, /aria-label="Previous product story"/);
  assert.match(source, /aria-label="Next product story"/);
  assert.match(source, /role="tablist" aria-label="Product stories"/);
  assert.doesNotMatch(source, /setInterval|setTimeout|autoplay/i);
  assert.doesNotMatch(source, /See Every Visit|Assign\. Track\. Approve|Verified Data/);
});

test("desktop stories include contextual in-picture evidence UI", () => {
  const source = desktopStories();
  assert.match(source, /STORY_EVIDENCE/);
  assert.match(source, /GPS location/);
  assert.match(source, /Evidence submitted/);
  assert.match(source, /Audit trail/);
  assert.match(source, /field evidence/);
});

test("remember-email preference persists only the email and clears when unchecked", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };

  persistRememberedLoginEmail(storage, "  person@example.com  ", true);
  assert.equal(values.get(REMEMBERED_LOGIN_EMAIL_KEY), "person@example.com");
  assert.equal(readRememberedLoginEmail(storage), "person@example.com");

  persistRememberedLoginEmail(storage, "person@example.com", false);
  assert.equal(values.has(REMEMBERED_LOGIN_EMAIL_KEY), false);
  assert.equal(readRememberedLoginEmail(storage), null);
  assert.doesNotMatch(loginPreferences(), /password/i);
});

test("login form exposes remember-email and valid legal destinations without changing submit ownership", () => {
  const source = loginPage();
  assert.match(source, /Remember my email/);
  assert.match(source, /persistRememberedLoginEmail\(window\.localStorage, email, shouldRemember\)/);
  assert.match(source, /Access your DeployIQ platform\./);
  assert.match(source, /href="\/privacy"[\s\S]{0,100}Privacy Notice/);
  assert.match(source, /href="\/terms"[\s\S]{0,100}Terms of Use/);
  assert.equal(existsSync(new URL("../app/privacy/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/terms/page.tsx", import.meta.url)), true);
  assert.match(source, /<form className="mt-8 grid gap-5" onSubmit=\{handleSubmit\}>/);
});

test("carousel meets the accessibility and mobile-safety requirements", () => {
  const source = carousel();
  assert.match(source, /aria-label="DeployIQ product introduction"/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /aria-selected=\{slideIndex === index\}/);
  assert.match(source, /aria-label=\{`Show slide \$\{slideIndex \+ 1\}: \$\{item\.theme\}`\}/);
  // Keyboard support and safe-area padding.
  assert.match(source, /event\.key === "ArrowRight"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /env\(safe-area-inset-top\)/);
  // Swipe works without relying on auto-rotation.
  assert.match(source, /onTouchStart/);
  assert.match(source, /onTouchEnd/);
  assert.doesNotMatch(source, /setInterval|autoplay|autoRotate/i);
  // Touch targets and contrast overlay.
  assert.match(source, /min-h-11 w-full rounded-lg bg-orange-500/);
  assert.match(source, /bg-gradient-to-b from-slate-950\/30 via-transparent to-slate-950/);
  assert.match(source, /h-\[54dvh\]/);
  assert.match(source, /overflow-hidden/);
});
