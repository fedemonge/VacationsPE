"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface RutaMapProps {
  puntoInicio: { lat: number; lon: number; nombre: string } | null;
  paradas: Array<{
    secuencia: number;
    lat: number;
    lon: number;
    cliente: string;
    direccion: string;
    esAgendada: boolean;
    periodo: string;
    horaEstimadaLlegada: string;
  }>;
}

// Numbered map pin SVG
function numberedPinSvg(fill: string, num: number, stroke: string = "#555"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 28 40">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z"
          fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="0.9"/>
    <text x="14" y="18" text-anchor="middle" font-size="13" font-weight="700"
          fill="white" font-family="Arial,sans-serif">${num}</text>
  </svg>`;
}

// Starting point pin SVG (house icon)
function startPinSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="0 0 28 40">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z"
          fill="#EA7704" stroke="#555" stroke-width="2" opacity="0.9"/>
    <text x="14" y="19" text-anchor="middle" font-size="16" fill="white" font-family="Arial,sans-serif">&#9679;</text>
  </svg>`;
}

function createNumberedIcon(color: string, num: number): L.DivIcon {
  return L.divIcon({
    html: numberedPinSvg(color, num),
    className: "",
    iconSize: [24, 34],
    iconAnchor: [12, 34],
    popupAnchor: [0, -30],
  });
}

function createStartIcon(): L.DivIcon {
  return L.divIcon({
    html: startPinSvg(),
    className: "",
    iconSize: [26, 36],
    iconAnchor: [13, 36],
    popupAnchor: [0, -32],
  });
}

export default function RutaMap({ puntoInicio, paradas }: RutaMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current).setView([-12.04, -77.03], 12);
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

  // Update markers and polyline when data changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear existing markers and polyline
    if (markersRef.current) {
      map.removeLayer(markersRef.current);
    }
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
    }

    const group = L.layerGroup();
    const routeCoords: L.LatLngExpression[] = [];

    // Add starting point
    if (puntoInicio) {
      const startCoord: L.LatLngExpression = [puntoInicio.lat, puntoInicio.lon];
      routeCoords.push(startCoord);

      const startMarker = L.marker(startCoord, { icon: createStartIcon() });
      startMarker.bindPopup(`
        <div style="min-width:180px;font-size:13px;line-height:1.5;">
          <p style="font-weight:700;margin:0 0 4px;font-size:14px;">Punto de Inicio</p>
          <p style="margin:3px 0;"><b>Agente:</b> ${puntoInicio.nombre}</p>
        </div>
      `);
      startMarker.addTo(group);
    }

    // Add stops
    for (const parada of paradas) {
      const coord: L.LatLngExpression = [parada.lat, parada.lon];
      routeCoords.push(coord);

      const color = parada.esAgendada ? "#EAB308" : "#3B82F6"; // Yellow for agendada, Blue for insertada
      const icon = createNumberedIcon(color, parada.secuencia);
      const tipo = parada.esAgendada ? "Agendada" : "Insertada";
      const tipoBadgeColor = parada.esAgendada ? "#EAB308" : "#3B82F6";

      const marker = L.marker(coord, { icon });
      marker.bindPopup(`
        <div style="min-width:220px;font-size:13px;line-height:1.5;">
          <p style="font-weight:700;margin:0 0 4px;font-size:14px;">#${parada.secuencia} - ${parada.cliente}</p>
          <p style="color:#666;margin:0 0 6px;font-size:12px;">${parada.direccion}</p>
          <hr style="margin:6px 0;border-color:#eee;">
          <p style="margin:3px 0;"><b>Hora Llegada:</b> ${parada.horaEstimadaLlegada}</p>
          <p style="margin:3px 0;"><b>Periodo:</b> ${parada.periodo}</p>
          <p style="margin:3px 0;">
            <b>Tipo:</b>
            <span style="display:inline-block;padding:1px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:white;background:${tipoBadgeColor};">${tipo}</span>
          </p>
        </div>
      `);
      marker.addTo(group);
    }

    group.addTo(map);
    markersRef.current = group;

    // Draw polyline connecting all points in order
    if (routeCoords.length >= 2) {
      const polyline = L.polyline(routeCoords, {
        color: "#EA7704",
        weight: 3,
        opacity: 0.8,
        dashArray: "8, 6",
      });
      polyline.addTo(map);
      polylineRef.current = polyline;
    }

    // Auto-fit bounds to show all markers
    if (routeCoords.length > 0) {
      const bounds = L.latLngBounds(routeCoords);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [puntoInicio, paradas]);

  const agendadasCount = paradas.filter((p) => p.esAgendada).length;
  const insertadasCount = paradas.filter((p) => !p.esAgendada).length;

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border border-gray-300 bg-white shadow-sm">
          <span
            className="inline-block"
            style={{ width: 14, height: 19 }}
            dangerouslySetInnerHTML={{
              __html: `<svg viewBox="0 0 28 40" width="14" height="19"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#EA7704" stroke="#555" stroke-width="2"/><circle cx="14" cy="14" r="4" fill="white" opacity="0.8"/></svg>`,
            }}
          />
          Inicio
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border border-gray-300 bg-white shadow-sm">
          <span
            className="inline-block"
            style={{ width: 14, height: 19 }}
            dangerouslySetInnerHTML={{
              __html: `<svg viewBox="0 0 28 40" width="14" height="19"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#EAB308" stroke="#555" stroke-width="2"/><circle cx="14" cy="14" r="4" fill="white" opacity="0.8"/></svg>`,
            }}
          />
          Agendadas ({agendadasCount})
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border border-gray-300 bg-white shadow-sm">
          <span
            className="inline-block"
            style={{ width: 14, height: 19 }}
            dangerouslySetInnerHTML={{
              __html: `<svg viewBox="0 0 28 40" width="14" height="19"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#3B82F6" stroke="#555" stroke-width="2"/><circle cx="14" cy="14" r="4" fill="white" opacity="0.8"/></svg>`,
            }}
          />
          Insertadas ({insertadasCount})
        </div>
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
