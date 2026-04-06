import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";

// ── Types ────────────────────────────────────────────────────────────

export interface ExportParada {
  secuencia: number;
  periodo: string;
  esAgendada: boolean;
  sot: string | null;
  codCliente: string | null;
  cliente: string | null;
  direccion: string | null;
  distrito: string | null;
  departamento: string | null;
  latitud: number | null;
  longitud: number | null;
  telefono: string | null;
  distanciaDesdeAnteriorKm: number;
  tiempoViajeMin: number;
  duracionVisitaMin: number;
  horaEstimadaLlegada: string | null;
  horaEstimadaSalida: string | null;
}

export interface ExportRuta {
  agente: string;
  fecha: string;
  puntoInicio: { lat: number; lon: number };
  totalVisitas: number;
  totalDistanciaKm: number;
  totalTiempoMin: number;
  paradas: ExportParada[];
}

// ── XLSX Export ──────────────────────────────────────────────────────

export function generateRouteXLSX(rutas: ExportRuta[]): Buffer {
  const wb = XLSX.utils.book_new();

  for (const ruta of rutas) {
    const rows: (string | number | boolean | null)[][] = [];

    // Header info
    rows.push(["Agente", ruta.agente]);
    rows.push(["Fecha", ruta.fecha]);
    rows.push(["Punto de Inicio", `${ruta.puntoInicio.lat}, ${ruta.puntoInicio.lon}`]);
    rows.push(["Total Visitas", ruta.totalVisitas]);
    rows.push(["Distancia Total (km)", round2(ruta.totalDistanciaKm)]);
    rows.push(["Tiempo Total (min)", round2(ruta.totalTiempoMin)]);
    rows.push([]); // empty row

    // Table headers
    const headers = [
      "Sec", "Periodo", "Tipo", "SOT", "Cod.Cliente", "Cliente",
      "Direccion", "Distrito", "Dpto", "Lat", "Lon", "Telefono",
      "Dist.(km)", "T.Viaje(min)", "Dur.Visita(min)", "H.Llegada", "H.Salida",
    ];
    rows.push(headers);

    // Data rows
    let totalDist = 0;
    let totalViaje = 0;
    let totalVisita = 0;

    for (const p of ruta.paradas) {
      totalDist += p.distanciaDesdeAnteriorKm;
      totalViaje += p.tiempoViajeMin;
      totalVisita += p.duracionVisitaMin;

      rows.push([
        p.secuencia,
        p.periodo,
        p.esAgendada ? "Agendada" : "Base",
        p.sot ?? "",
        p.codCliente ?? "",
        p.cliente ?? "",
        p.direccion ?? "",
        p.distrito ?? "",
        p.departamento ?? "",
        p.latitud,
        p.longitud,
        p.telefono ?? "",
        round2(p.distanciaDesdeAnteriorKm),
        round2(p.tiempoViajeMin),
        round2(p.duracionVisitaMin),
        p.horaEstimadaLlegada ?? "",
        p.horaEstimadaSalida ?? "",
      ]);
    }

    // Empty row + totals
    rows.push([]);
    rows.push([
      "", "", "", "", "", "", "", "", "", "", "", "TOTALES",
      round2(totalDist), round2(totalViaje), round2(totalVisita), "", "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths
    ws["!cols"] = [
      { wch: 5 },  // Sec
      { wch: 8 },  // Periodo
      { wch: 10 }, // Tipo
      { wch: 14 }, // SOT
      { wch: 12 }, // Cod.Cliente
      { wch: 30 }, // Cliente
      { wch: 40 }, // Direccion
      { wch: 16 }, // Distrito
      { wch: 14 }, // Dpto
      { wch: 12 }, // Lat
      { wch: 12 }, // Lon
      { wch: 14 }, // Telefono
      { wch: 10 }, // Dist
      { wch: 12 }, // T.Viaje
      { wch: 14 }, // Dur.Visita
      { wch: 10 }, // H.Llegada
      { wch: 10 }, // H.Salida
    ];

    // Sanitize sheet name (max 31 chars, no special chars)
    const sheetName = sanitizeSheetName(ruta.agente);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}

// ── PDF Export ───────────────────────────────────────────────────────

export function generateRoutePDF(rutas: ExportRuta[]): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 10;
  const marginR = 10;
  const marginTop = 10;
  const marginBottom = 10;
  const usableW = pageW - marginL - marginR;

  for (let ri = 0; ri < rutas.length; ri++) {
    const ruta = rutas[ri];
    if (ri > 0) doc.addPage();

    let y = marginTop;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Reporte de Ruta - ${ruta.agente}`, marginL, y + 6);
    y += 10;

    // Subtitle
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Fecha: ${ruta.fecha}  |  Inicio: ${ruta.puntoInicio.lat}, ${ruta.puntoInicio.lon}`,
      marginL, y + 5
    );
    y += 8;

    // Summary
    doc.text(
      `Visitas: ${ruta.totalVisitas}  |  Distancia: ${round2(ruta.totalDistanciaKm)} km  |  Tiempo: ${round2(ruta.totalTiempoMin)} min`,
      marginL, y + 5
    );
    y += 10;

    // Draw separator
    doc.setDrawColor(100);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, pageW - marginR, y);
    y += 4;

    // Table columns (subset for PDF readability)
    const cols: { header: string; width: number; key: keyof ExportParada | "tipo" }[] = [
      { header: "Sec",      width: 10,  key: "secuencia" },
      { header: "Periodo",  width: 14,  key: "periodo" },
      { header: "Tipo",     width: 16,  key: "tipo" },
      { header: "SOT",      width: 22,  key: "sot" },
      { header: "Cliente",  width: 44,  key: "cliente" },
      { header: "Direccion",width: 60,  key: "direccion" },
      { header: "Distrito", width: 28,  key: "distrito" },
      { header: "Telefono", width: 24,  key: "telefono" },
      { header: "Dist(km)", width: 16,  key: "distanciaDesdeAnteriorKm" },
      { header: "Viaje(m)", width: 16,  key: "tiempoViajeMin" },
      { header: "Llegada",  width: 16,  key: "horaEstimadaLlegada" },
      { header: "Salida",   width: 16,  key: "horaEstimadaSalida" },
    ];

    // Scale columns to fit usable width
    const totalColW = cols.reduce((s, c) => s + c.width, 0);
    const scale = usableW / totalColW;
    const scaledCols = cols.map((c) => ({ ...c, width: c.width * scale }));

    const rowH = 6;
    const headerH = 7;
    const fontSize = 7;

    // Table header
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(15, 45, 58); // #0F2D3A
    doc.rect(marginL, y, usableW, headerH, "F");
    doc.setTextColor(255, 255, 255);

    let cx = marginL;
    for (const col of scaledCols) {
      doc.text(col.header, cx + 1, y + 5);
      cx += col.width;
    }
    y += headerH;

    // Reset text color
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");

    // Data rows
    for (let pi = 0; pi < ruta.paradas.length; pi++) {
      // Check page break
      if (y + rowH > pageH - marginBottom) {
        doc.addPage();
        y = marginTop;

        // Re-draw header
        doc.setFont("helvetica", "bold");
        doc.setFillColor(15, 45, 58);
        doc.rect(marginL, y, usableW, headerH, "F");
        doc.setTextColor(255, 255, 255);
        cx = marginL;
        for (const col of scaledCols) {
          doc.text(col.header, cx + 1, y + 5);
          cx += col.width;
        }
        y += headerH;
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
      }

      const p = ruta.paradas[pi];

      // Alternate row background
      if (pi % 2 === 0) {
        doc.setFillColor(240, 240, 240);
        doc.rect(marginL, y, usableW, rowH, "F");
      }

      cx = marginL;
      for (const col of scaledCols) {
        let val: string;
        if (col.key === "tipo") {
          val = p.esAgendada ? "Agendada" : "Base";
        } else {
          const raw = p[col.key as keyof ExportParada];
          if (raw == null) {
            val = "";
          } else if (typeof raw === "number") {
            val = round2(raw).toString();
          } else if (typeof raw === "boolean") {
            val = raw ? "Si" : "No";
          } else {
            val = String(raw);
          }
        }

        // Truncate long text to fit column
        const maxChars = Math.floor(col.width / 1.6);
        if (val.length > maxChars) {
          val = val.substring(0, maxChars - 1) + "~";
        }

        doc.text(val, cx + 1, y + 4.5);
        cx += col.width;
      }

      y += rowH;
    }

    // Totals row
    if (y + rowH > pageH - marginBottom) {
      doc.addPage();
      y = marginTop;
    }

    doc.setFont("helvetica", "bold");
    doc.setFillColor(15, 45, 58);
    doc.rect(marginL, y, usableW, rowH, "F");
    doc.setTextColor(255, 255, 255);

    cx = marginL;
    for (const col of scaledCols) {
      let val = "";
      if (col.key === "secuencia") val = "TOTAL";
      if (col.key === "distanciaDesdeAnteriorKm") val = round2(ruta.totalDistanciaKm).toString();
      if (col.key === "tiempoViajeMin") val = round2(ruta.totalTiempoMin).toString();
      doc.text(val, cx + 1, y + 4.5);
      cx += col.width;
    }
    doc.setTextColor(0, 0, 0);
    y += rowH;

    // Footer
    y += 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Generado por SistemasWoden - ${new Date().toISOString().split("T")[0]}`,
      marginL, y + 3
    );
    doc.setTextColor(0, 0, 0);
  }

  const arrayBuf = doc.output("arraybuffer");
  return Buffer.from(arrayBuf);
}

// ── CSV Export ───────────────────────────────────────────────────────

export function generateRouteCSV(
  ruta: ExportRuta,
  fieldOrder: string[],
  delimiter: string = ","
): string {
  const lines: string[] = [];

  // Header line
  lines.push(fieldOrder.join(delimiter));

  // Data rows
  for (const p of ruta.paradas) {
    const values = fieldOrder.map((field) => {
      const raw = (p as unknown as Record<string, unknown>)[field];
      if (raw == null) return "";
      if (typeof raw === "boolean") return raw ? "1" : "0";
      const str = String(raw);
      // Escape delimiter and quotes in values
      if (str.includes(delimiter) || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(delimiter));
  }

  return lines.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sanitizeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no special chars: \ / * ? : [ ]
  return name.replace(/[\\/*?:\[\]]/g, "_").substring(0, 31);
}
