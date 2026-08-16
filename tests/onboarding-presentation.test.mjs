import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("../components/onboarding/OnboardingShell.tsx", import.meta.url), "utf8");
const objective = readFileSync(new URL("../components/onboarding/BusinessObjectiveStep.tsx", import.meta.url), "utf8");
const requirements = readFileSync(new URL("../components/onboarding/GuidedDiscoveryStep.tsx", import.meta.url), "utf8");
const visual = readFileSync(new URL("../components/onboarding/OnboardingJourneyVisual.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/DashboardSidebar.tsx", import.meta.url), "utf8");
const coreAdminShell = readFileSync(new URL("../components/admin/CoreAdminShell.tsx", import.meta.url), "utf8");

test("Get Started storytelling begins with canonical Step 1 and continues into Step 2", () => {
  assert.match(objective, /Step 1 of 4/);
  assert.match(requirements, /Step 2 of 4/);
  assert.match(shell, /const isGetStartedStep = isFreshObjectiveStep \|\| step === "discovery"/);
  assert.match(shell, /\{isGetStartedStep \? \([\s\S]{0,300}<OnboardingJourneyVisual context=\{step === "objective" \? "goal" : "requirements"\} \/>/);
  assert.match(shell, /step === "objective" \? \([\s\S]{0,180}<BusinessObjectiveStep/);
  assert.match(shell, /<GuidedDiscoveryStep/);
  assert.doesNotMatch(objective, /OnboardingJourneyVisual/);
  assert.doesNotMatch(requirements, /OnboardingJourneyVisual/);
});

test("one shell-owned story instance preserves manual background selection across Step 1 and Step 2", () => {
  assert.equal((shell.match(/<OnboardingJourneyVisual /g) ?? []).length, 1);
  assert.match(visual, /storyIndexes/);
  assert.match(visual, /\{ goal: 0, requirements: 0 \}/);
  assert.match(visual, /onClick=\{\(\) => selectStory\(index\)\}/);
});

test("storytelling uses three contextual stories per step with fixed cards", () => {
  assert.match(visual, /export type OnboardingJourneyContext = "goal" \| "requirements"/);
  assert.match(visual, /Start your journey to a smarter workspace\./);
  assert.match(visual, /Tell us what you want to achieve and DeployIQ will help identify the right solution for your programme\./);
  assert.match(visual, /One platform\. Different field operations\./);
  assert.match(visual, /Tell us the goal\. We’ll shape the solution\./);
  assert.match(visual, /Build the right workspace around your needs\./);
  assert.match(visual, /Tell us where, how and at what scale you operate so DeployIQ can configure the right capabilities and commercial plan\./);
  assert.match(visual, /Built for the size of your operation\./);
  assert.match(visual, /Only the capabilities your programme needs\./);
  assert.match(visual, /Tailored recommendations/);
  assert.match(visual, /Scalable for your growth/);
  assert.match(visual, /Secure and reliable/);
  assert.match(visual, /role="tablist" aria-label="Get Started stories"/);
});

test("story rotation is restrained, visibility-aware and disabled for reduced motion", () => {
  assert.match(visual, /const STORY_ROTATION_MS = 7_000/);
  assert.match(visual, /window\.setInterval/);
  assert.match(visual, /document\.hidden/);
  assert.match(visual, /visibilitychange/);
  assert.match(visual, /prefers-reduced-motion: reduce/);
  assert.match(visual, /manualSelectionVersion/);
  assert.match(visual, /duration-500 motion-reduce:transition-none/);
  assert.match(visual, /min-h-\[17rem\]/);
});

test("presentation does not own onboarding business operations", () => {
  assert.doesNotMatch(visual, /onboarding_drafts|fetch\(|supabase|pricing|checkout|provision|authenticate/i);
});

test("Core Admin keeps header Sign out and omits the sidebar duplicate", () => {
  assert.match(coreAdminShell, /<SignOutButton \/>/);
  assert.match(sidebar, /audience === "client"[\s\S]{0,180}<SignOutButton className="w-full" \/>/);
  assert.doesNotMatch(sidebar, /audience === "admin"[\s\S]{0,180}<SignOutButton/);
});
