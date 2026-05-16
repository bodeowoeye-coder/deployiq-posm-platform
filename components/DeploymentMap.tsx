"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import type { Submission } from "@/lib/types";
import { displayProjectName } from "@/lib/projects";

declare global {
  interface Window {
    L?: any;
  }
}

function markerColor(status: string) {
  if (status === "Approved") return "#059669";
  if (status === "Rejected") return "#dc2626";
  if (status === "Flagged") return "#ea580c";
  return "#d97706";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[character] ?? character;
  });
}

function loadLeaflet() {
  return new Promise<void>((resolve, reject) => {
    if (window.L) {
      resolve();
      return;
    }

    if (!document.querySelector('link[data-leaflet="css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.dataset.leaflet = "css";
      document.head.appendChild(link);
    }

    const existing = document.querySelector('script[data-leaflet="js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load map library.")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.dataset.leaflet = "js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load map library."));
    document.body.appendChild(script);
  });
}

export function DeploymentMap({
  submissions,
  audience = "admin",
  variant = "standard"
}: {
  submissions: Submission[];
  audience?: "admin" | "client";
  variant?: "standard" | "hero";
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [error, setError] = useState("");

  const mappable = useMemo(
    () => submissions.filter((item) => item.gps_latitude !== null && item.gps_longitude !== null),
    [submissions]
  );

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      try {
        await loadLeaflet();
        if (cancelled || !mapRef.current || !window.L) return;

        const L = window.L;
        const map =
          mapInstanceRef.current ??
          L.map(mapRef.current, {
            zoomControl: true,
            scrollWheelZoom: false
          });

        mapInstanceRef.current = map;

        if (!layerRef.current) {
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          }).addTo(map);
          layerRef.current = L.layerGroup().addTo(map);
        }

        layerRef.current.clearLayers();

        if (mappable.length === 0) {
          map.setView([9.082, 8.6753], 6);
          map.invalidateSize();
          return;
        }

        const bounds: Array<[number, number]> = [];
        mappable.forEach((item) => {
          const latitude = item.gps_latitude as number;
          const longitude = item.gps_longitude as number;
          bounds.push([latitude, longitude]);
          const popup =
            audience === "client"
              ? `
            <div style="min-width:180px">
              <img src="${escapeHtml(item.image_url)}" alt="" style="width:100%;height:90px;object-fit:cover;border-radius:6px;margin-bottom:8px" />
              <strong>${escapeHtml(item.salon_name || "Name not visible")}</strong><br/>
              <span>${escapeHtml(item.address || "Address not visible")}</span><br/>
              <span>${escapeHtml(item.brand_name || "Unassigned brand")}</span><br/>
              <span>${escapeHtml(displayProjectName(item.project_name))}</span><br/>
              <span>${escapeHtml([item.installer_state, item.installer_lga].filter(Boolean).join(" | ") || "Location not confirmed")}</span><br/>
              <span>${escapeHtml(item.installation_date || item.submitted_at.slice(0, 10))}</span>
            </div>
          `
              : `
            <div style="min-width:180px">
              <img src="${escapeHtml(item.image_url)}" alt="" style="width:100%;height:90px;object-fit:cover;border-radius:6px;margin-bottom:8px" />
              <strong>${escapeHtml(item.salon_name || "Name not visible")}</strong><br/>
              <span>${escapeHtml(item.address || "Address not visible")}</span><br/>
              <span>${escapeHtml(item.installer_name || "Unnamed installer")} | ${escapeHtml(item.brand_name || "Unassigned brand")}</span><br/>
              <span>${escapeHtml(displayProjectName(item.project_name))}</span><br/>
              <span>${escapeHtml([item.installer_region, item.installer_state, item.installer_lga].filter(Boolean).join(" | ") || "Location not confirmed")}</span><br/>
              <span>${escapeHtml(item.status)} | ${escapeHtml(item.installation_date || item.submitted_at.slice(0, 10))}</span>
            </div>
          `;
          const color = audience === "client" ? "#ea7a18" : markerColor(item.status);
          L.circleMarker([latitude, longitude], {
            radius: 8,
            color,
            fillColor: color,
            fillOpacity: 0.85,
            weight: 2
          })
            .bindPopup(popup)
            .addTo(layerRef.current);
        });

        map.invalidateSize();
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
      } catch (mapError) {
        setError(mapError instanceof Error ? mapError.message : "Could not load map.");
      }
    }

    renderMap();
    return () => {
      cancelled = true;
    };
  }, [audience, mappable]);

  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;

    function refreshMapSize() {
      const map = mapInstanceRef.current;
      if (!map) return;

      window.requestAnimationFrame(() => {
        map.invalidateSize();

        if (mappable.length > 0) {
          const bounds = mappable.map((item) => [item.gps_latitude as number, item.gps_longitude as number] as [number, number]);
          map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
        }
      });
    }

    const resizeObserver = new ResizeObserver(() => refreshMapSize());
    resizeObserver.observe(container);
    window.addEventListener("resize", refreshMapSize);
    const timeoutId = window.setTimeout(refreshMapSize, 120);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", refreshMapSize);
      window.clearTimeout(timeoutId);
    };
  }, [mappable]);

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 break-words text-base font-bold leading-snug">Deployment map</h2>
        <span className="shrink-0 whitespace-normal text-sm leading-snug text-slate-500">{mappable.length} mapped</span>
      </div>
      {error ? <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</div> : null}
      {mappable.length === 0 ? (
        <EmptyState title="No map points yet" message="Submissions with captured GPS coordinates will appear here." icon={<MapPinOff aria-hidden size={22} />} />
      ) : (
        <div ref={mapRef} className={`min-h-0 w-full min-w-0 overflow-hidden rounded-lg bg-slate-100 ${variant === "hero" ? "h-[420px] sm:h-[520px] lg:h-[620px]" : "h-[280px] sm:h-[360px]"}`} />
      )}
    </div>
  );
}
