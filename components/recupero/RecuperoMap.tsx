"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { isSuccessful } from "@/lib/recupero/types";

export interface RecuperoTask {
  id: string;
  latitud: number | null;
  longitud: number | null;
  latitudCierre: number | null;
  longitudCierre: number | null;
  estado: string | null;
  tipoCierre: string | null;
  esQuemada: boolean;
  agenteCampo: string;
  nombreUsuario: string | null;
  direccion: string | null;
  distanciaMetros: number | null;
  tipoBase: string | null;
  grupo: string | null;
  coordStatus: string;
  tarea: string | null;
}

interface RecuperoMapProps {
  tasks: RecuperoTask[];
  stats?: {
    total: number;
    exitosas: number;
    noExitosas: number;
    quemadas: number;
  };
}

// Compact map pin SVG
function pinSvg(fill: string, stroke: string = "#555"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="26" viewBox="0 0 28 40">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z"
          fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="0.85"/>
    <circle cx="14" cy="14" r="5" fill="white" opacity="0.8"/>
  </svg>`;
}

function createPinIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: pinSvg(color),
    className: "",
    iconSize: [18, 26],
    iconAnchor: [9, 26],
    popupAnchor: [0, -22],
  });
}

const PIN_ICONS = {
  agendadas: createPinIcon("#EAB308"),   // Yellow
  exitosas: createPinIcon("#22C55E"),    // Green
  noExitosas: createPinIcon("#EF4444"), // Red
  quemadas: createPinIcon("#1F2937"),   // Black/dark
};

interface LayerDef {
  key: string;
  label: string;
  color: string;
  icon: L.DivIcon;
  getCoords: (t: RecuperoTask) => [number, number] | null;
  filter: (t: RecuperoTask) => boolean;
}

const LAYERS: LayerDef[] = [
  {
    key: "agendadas",
    label: "Agendadas",
    color: "#EAB308",
    icon: PIN_ICONS.agendadas,
    // Agendadas use the customer-reported coords (latitud/longitud)
    getCoords: (t) =>
      t.latitud != null && t.longitud != null ? [t.latitud, t.longitud] : null,
    // ALL records are agendadas
    filter: () => true,
  },
  {
    key: "exitosas",
    label: "Exitosas",
    color: "#22C55E",
    icon: PIN_ICONS.exitosas,
    // Exitosas use the closure coords (where agent closed the task)
    getCoords: (t) =>
      t.latitudCierre != null && t.longitudCierre != null
        ? [t.latitudCierre, t.longitudCierre]
        : t.latitud != null && t.longitud != null
          ? [t.latitud, t.longitud]
          : null,
    filter: (t) => isSuccessful(t.tipoCierre),
  },
  {
    key: "noExitosas",
    label: "No Exitosas",
    color: "#EF4444",
    icon: PIN_ICONS.noExitosas,
    getCoords: (t) =>
      t.latitudCierre != null && t.longitudCierre != null
        ? [t.latitudCierre, t.longitudCierre]
        : t.latitud != null && t.longitud != null
          ? [t.latitud, t.longitud]
          : null,
    filter: (t) =>
      !t.esQuemada && !!t.tipoCierre && !isSuccessful(t.tipoCierre),
  },
  {
    key: "quemadas",
    label: "Quemadas",
    color: "#1F2937",
    icon: PIN_ICONS.quemadas,
    getCoords: (t) =>
      t.latitudCierre != null && t.longitudCierre != null
        ? [t.latitudCierre, t.longitudCierre]
        : t.latitud != null && t.longitud != null
          ? [t.latitud, t.longitud]
          : null,
    filter: (t) => t.esQuemada,
  },
];

export default function RecuperoMap({ tasks, stats }: RecuperoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroups = useRef<Record<string, L.LayerGroup>>({});
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    agendadas: true,
    exitosas: true,
    noExitosas: true,
    quemadas: true,
  });

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current).setView([-12.04, -77.03], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update markers when tasks or active layers change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear existing layers
    Object.values(layerGroups.current).forEach((lg) => {
      map.removeLayer(lg);
    });
    layerGroups.current = {};

    // Create layer groups — render in order so quemadas/exitosas are on top of agendadas
    for (const layer of LAYERS) {
      if (!activeLayers[layer.key]) continue;

      const group = L.layerGroup();
      const layerTasks = tasks.filter((t) => layer.filter(t));

      for (const task of layerTasks) {
        const coords = layer.getCoords(task);
        if (!coords) continue;

        const marker = L.marker(coords, { icon: layer.icon });

        const dist =
          task.distanciaMetros != null
            ? task.distanciaMetros >= 1000
              ? `${(task.distanciaMetros / 1000).toFixed(1)} km`
              : `${Math.round(task.distanciaMetros)} m`
            : "N/A";

        marker.bindPopup(`
          <div style="min-width:220px;font-size:13px;line-height:1.5;">
            <p style="font-weight:700;margin:0 0 4px;font-size:14px;">${task.nombreUsuario || "Sin nombre"}</p>
            <p style="color:#666;margin:0 0 6px;font-size:12px;">${task.direccion || "Sin dirección"}</p>
            <hr style="margin:6px 0;border-color:#eee;">
            <p style="margin:3px 0;"><b>Agente:</b> ${task.agenteCampo}</p>
            <p style="margin:3px 0;"><b>Resultado:</b> ${task.tipoCierre || "Pendiente"}</p>
            <p style="margin:3px 0;"><b>Tipo Base:</b> ${task.tipoBase || "N/A"}</p>
            <p style="margin:3px 0;"><b>Grupo:</b> ${task.grupo || "N/A"}</p>
            <p style="margin:3px 0;"><b>Distancia:</b> ${dist}</p>
            ${task.esQuemada ? '<p style="margin:6px 0;color:#dc2626;font-weight:700;font-size:13px;">⚠ GESTIÓN QUEMADA</p>' : ""}
          </div>
        `);

        marker.addTo(group);
      }

      group.addTo(map);
      layerGroups.current[layer.key] = group;
    }
  }, [tasks, activeLayers]);

  const toggleLayer = (key: string) => {
    setActiveLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Use stats for consistent counts, fallback to task-based counts
  const counts: Record<string, number> = stats
    ? {
        agendadas: stats.total,
        exitosas: stats.exitosas,
        noExitosas: stats.noExitosas - stats.quemadas,
        quemadas: stats.quemadas,
      }
    : LAYERS.reduce(
        (acc, layer) => {
          acc[layer.key] = tasks.filter((t) => layer.filter(t)).length;
          return acc;
        },
        {} as Record<string, number>
      );

  return (
    <div>
      {/* Layer toggle controls */}
      <div className="flex flex-wrap gap-2 mb-3">
        {LAYERS.map((layer) => (
          <button
            key={layer.key}
            onClick={() => toggleLayer(layer.key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
              activeLayers[layer.key]
                ? "border-gray-300 bg-white shadow-sm"
                : "border-gray-200 bg-gray-100 text-gray-400"
            }`}
          >
            <span
              className="inline-block"
              style={{ width: 12, height: 17 }}
              dangerouslySetInnerHTML={{
                __html: `<svg viewBox="0 0 28 40" width="12" height="17"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="${activeLayers[layer.key] ? layer.color : "#d1d5db"}" stroke="#555" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="white" opacity="0.8"/></svg>`,
              }}
            />
            {layer.label} ({counts[layer.key]})
          </button>
        ))}
      </div>

      {/* Map container */}
      <div
        ref={mapRef}
        style={{ height: "60vh", width: "100%" }}
        className="rounded-lg border border-gray-200"
      />
    </div>
  );
}
