"use client";

import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Submission } from "@/lib/types";
import { displayProjectName } from "@/lib/projects";

export function PhotoLightbox({
  submissions,
  activeIndex,
  onClose,
  onNavigate,
  audience = "admin"
}: {
  submissions: Submission[];
  activeIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
  audience?: "admin" | "client";
}) {
  const [zoom, setZoom] = useState(1);
  const item = activeIndex === null ? null : submissions[activeIndex];

  useEffect(() => {
    setZoom(1);
  }, [activeIndex]);

  if (!item || activeIndex === null) return null;

  const previous = (activeIndex - 1 + submissions.length) % submissions.length;
  const next = (activeIndex + 1) % submissions.length;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/95 text-white" role="dialog" aria-modal="true" aria-label="Installation photo viewer">
      <div className="absolute right-3 top-3 z-10 flex gap-2 sm:right-4 sm:top-4">
        <IconButton label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>
          <Minus size={18} />
        </IconButton>
        <IconButton label="Zoom in" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>
          <Plus size={18} />
        </IconButton>
        <IconButton label="Close viewer" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      {submissions.length > 1 ? (
        <>
          <NavButton label="Previous image" side="left" onClick={() => onNavigate(previous)}>
            <ChevronLeft size={24} />
          </NavButton>
          <NavButton label="Next image" side="right" onClick={() => onNavigate(next)}>
            <ChevronRight size={24} />
          </NavButton>
        </>
      ) : null}

      <div className="flex h-full min-h-0 min-w-0 items-center justify-center overflow-hidden p-4 pb-56 sm:p-8 sm:pb-40">
        <img
          className="max-h-full max-w-full rounded-lg object-contain transition-transform duration-150"
          style={{ transform: `scale(${zoom})` }}
          src={item.image_url}
          alt={item.salon_name || "Uploaded board"}
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 max-h-[48vh] overflow-y-auto border-t border-white/10 bg-slate-950/90 p-4 backdrop-blur">
        {audience === "client" ? (
          <div className="mx-auto grid min-w-0 max-w-6xl gap-3 text-sm leading-snug sm:grid-cols-2 lg:grid-cols-4">
            <Meta label="Brand" value={item.brand_name || "Unassigned"} />
            <Meta label="Project" value={displayProjectName(item.project_name)} />
            <Meta label="Timestamp" value={`${item.installation_date || item.submitted_at.slice(0, 10)} ${item.installation_time || ""}`} />
            <Meta label="GPS" value={`${item.gps_latitude ?? "n/a"}, ${item.gps_longitude ?? "n/a"}`} />
            <Meta label="Location" value={[item.installer_region, item.installer_state, item.installer_lga].filter(Boolean).join(" | ") || item.address || "Unknown location"} />
          </div>
        ) : (
          <div className="mx-auto grid min-w-0 max-w-6xl gap-3 text-sm leading-snug sm:grid-cols-2 lg:grid-cols-4">
            <Meta label="Installer" value={item.installer_name || "Unnamed installer"} />
            <Meta label="Project" value={displayProjectName(item.project_name)} />
            <Meta label="Selected / detected brand" value={`${item.brand_name || "Unassigned"} / ${item.detected_brand_name || "Uncertain"}`} />
            <Meta label="Status" value={`${item.status} | ${item.brand_match_status || "Unreviewed"}`} />
            <Meta label="AI match confidence" value={item.ai_confidence_level || "n/a"} />
            <Meta label="Timestamp" value={`${item.installation_date || item.submitted_at.slice(0, 10)} ${item.installation_time || ""}`} />
            <Meta label="GPS" value={`${item.gps_latitude ?? "n/a"}, ${item.gps_longitude ?? "n/a"}`} />
            <Meta label="Location" value={[item.installer_region, item.installer_state, item.installer_lga].filter(Boolean).join(" | ") || item.address || "Unknown location"} />
            <Meta label="Duplicate status" value={item.duplicate_status || "Unique"} />
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/10" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function NavButton({
  label,
  side,
  onClick,
  children
}: {
  label: string;
  side: "left" | "right";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`absolute top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 ${
        side === "left" ? "left-4" : "right-4"
      }`}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="whitespace-normal break-words text-xs uppercase leading-snug text-slate-400">{label}</div>
      <div className="mt-1 whitespace-normal break-words font-medium leading-snug">{value}</div>
    </div>
  );
}
