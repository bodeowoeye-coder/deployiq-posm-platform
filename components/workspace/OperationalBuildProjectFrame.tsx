"use client";

import { usePathname } from "next/navigation";
import { BuildProjectShell, type BuildProjectNavigationItem } from "@/components/workspace/BuildProjectShell";
import type { CanonicalBuildProject } from "@/lib/build/projects/types";

const NAVIGATION: BuildProjectNavigationItem[] = [
  { key: "overview", label: "Overview", segment: "" },
  { key: "sites", label: "Sites", segment: "sites" },
  { key: "work-packages", label: "Work Packages", segment: "work-packages" },
  { key: "work-plans", label: "Work Plans", segment: "work-plans" },
  { key: "activities", label: "Activities", segment: "activities" },
  { key: "inspections", label: "Inspections", segment: "inspections" },
  { key: "exceptions", label: "Exceptions", segment: "exceptions" },
  { key: "attention", label: "Management Attention", segment: "attention" },
];

export function OperationalBuildProjectFrame({ project, children }: { project: CanonicalBuildProject; children: React.ReactNode }) {
  const pathname = usePathname();
  const base = `/workspace/build/projects/${project.id}`;
  const remainder = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : "";
  const active = remainder.startsWith("activities/") ? "activities" : remainder.split("/")[0] || "overview";
  return <BuildProjectShell project={project} activeSection={active} routeBase={base} projectsHref="/workspace/build/projects" navigation={NAVIGATION}>{children}</BuildProjectShell>;
}
