"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const YEARS = [2025, 2026, 2027];

interface KpiSet {
  total: number;
  exitosas: number;
  noExitosas: number;
  quemadas: number;
  sinCoords: number;
  efectividad: number;
  tasaQuemadas: number;
  avgPerAgent?: number;
  numAgents?: number;
}

interface ReportData {
  agenteCampo: string;
  periodoYear: number;
  periodoMonth: number | null;
  day: number | null;
  kpis: { agent: KpiSet; company: KpiSet };
  trend: Record<string, unknown>[];
  trendType: "daily" | "monthly";
  hourly: Record<string, unknown>[];
  resultados: { tipoCierre: string; count: number; pct: number }[];
}

export default function AgentReportPage() {
  const { authenticated } = useAuth();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [day, setDay] = useState("");
  const [trendView, setTrendView] = useState<"daily" | "monthly">("daily");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [agentes, setAgentes] = useState<string[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Load agent list
  useEffect(() => {
    fetch(`/api/recupero/filters?year=${year}&month=${month || ""}`)
      .then(r => r.ok ? r.json() : { agentes: [] })
      .then(d => setAgentes(d.agentes || []))
      .catch(() => {});
  }, [year, month]);

  const loadReport = useCallback(async () => {
    if (!selectedAgent) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("agenteCampo", selectedAgent);
      params.set("periodoYear", String(year));
      if (month) params.set("periodoMonth", month);
      if (day) params.set("day", day);
      params.set("trendView", trendView);
      const res = await fetch(`/api/recupero/agent-report?${params}`);
      if (res.ok) {
        setReport(await res.json());
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [selectedAgent, year, month, day, trendView]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const periodLabel = day && month
    ? `${day} ${MONTHS[parseInt(month, 10) - 1]} ${year}`
    : month
    ? `${MONTHS[parseInt(month, 10) - 1]} ${year}`
    : `${year}`;

  // KPI comparison card
  const kpiCompare = (label: string, agentVal: number, companyVal: number, format: "number" | "pct" = "number") => {
    const diff = format === "pct" ? agentVal - companyVal : (companyVal > 0 ? ((agentVal - companyVal) / companyVal) * 100 : 0);
    const isPositive = diff > 0;
    const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
    const color = label.includes("Quemadas")
      ? (isPositive ? "text-red-600" : "text-green-600")
      : (isPositive ? "text-green-600" : "text-red-600");

    return (
      <div className="border rounded-lg p-3 bg-white">
        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
        <div className="flex items-end justify-between mt-1">
          <div>
            <p className="text-xl font-bold text-gray-900">
              {format === "pct" ? `${agentVal.toFixed(1)}%` : agentVal.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400">
              Cía: {format === "pct" ? `${companyVal.toFixed(1)}%` : companyVal.toLocaleString()}
            </p>
          </div>
          <span className={`text-xs font-bold ${color}`}>
            {arrow} {Math.abs(diff).toFixed(1)}{format === "pct" ? "pp" : "%"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Controls (hidden on print) */}
      <div className="print:hidden mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href="/recupero/reportes" className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Reporte Individual de Agente</h1>
          </div>
          {report && (
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const el = document.getElementById("agent-report");
                  if (!el) return;
                  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 1100 });
                  const imgData = canvas.toDataURL("image/png");
                  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
                  const pdfW = pdf.internal.pageSize.getWidth();
                  const pdfH = pdf.internal.pageSize.getHeight();
                  const margin = 5;
                  const usableW = pdfW - margin * 2;
                  const usableH = pdfH - margin * 2;
                  const imgW = canvas.width;
                  const imgH = canvas.height;
                  const ratio = Math.min(usableW / imgW, usableH / imgH);
                  const w = imgW * ratio;
                  const h = imgH * ratio;
                  pdf.addImage(imgData, "PNG", margin + (usableW - w) / 2, margin, w, h);
                  pdf.save(`Reporte_${report.agenteCampo.replace(/\s+/g, "_")}_${periodLabel.replace(/\s+/g, "_")}.pdf`);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                PDF
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-[#EA7704] text-white rounded-lg hover:bg-[#d06a03] text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Imprimir
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-5 gap-3">
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="border rounded-md px-3 py-2 text-sm">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
            <option value="">Todo el año</option>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={day} onChange={e => setDay(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
            <option value="">Todos los días</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
            <option value="">Seleccionar agente...</option>
            {agentes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="flex rounded-md overflow-hidden border">
            <button
              onClick={() => setTrendView("daily")}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${trendView === "daily" ? "bg-[#EA7704] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Por Día
            </button>
            <button
              onClick={() => setTrendView("monthly")}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${trendView === "monthly" ? "bg-[#EA7704] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Por Mes
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#EA7704]" />
        </div>
      )}

      {/* No agent selected */}
      {!loading && !report && (
        <div className="text-center py-20 text-gray-400">Selecciona un agente para generar el reporte</div>
      )}

      {/* === THE REPORT === */}
      {!loading && report && (
        <div className="print:p-0" id="agent-report" style={{ maxWidth: "1100px", margin: "0 auto" }}>
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-[#EA7704] pb-2 mb-2">
            <div>
              <h2 className="text-base font-bold text-gray-900">{report.agenteCampo}</h2>
              <p className="text-xs text-gray-500">Reporte de Efectividad — {periodLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400">Woden Peru — Recupero</p>
              <p className="text-[10px] text-gray-400">Generado: {new Date().toLocaleDateString("es-PE")}</p>
            </div>
          </div>

          {/* KPI Grid + Summary in one row */}
          <div className="grid grid-cols-9 gap-1.5 mb-2">
            {/* 4 KPI comparison cards */}
            <div className="col-span-2">{kpiCompare("Total Gestiones", report.kpis.agent.total, report.kpis.company.avgPerAgent || 0)}</div>
            <div className="col-span-2">{kpiCompare("Efectividad", report.kpis.agent.efectividad, report.kpis.company.efectividad, "pct")}</div>
            <div className="col-span-2">{kpiCompare("Exitosas", report.kpis.agent.exitosas, Math.round((report.kpis.company.exitosas) / (report.kpis.company.numAgents || 1)))}</div>
            <div className="col-span-2">{kpiCompare("Tasa Quemadas", report.kpis.agent.tasaQuemadas, report.kpis.company.tasaQuemadas, "pct")}</div>
            {/* Summary column */}
            <div className="border rounded-lg p-2 bg-gray-50 flex flex-col justify-center text-center text-[10px]">
              <p className="font-bold text-sm text-gray-900">{report.kpis.agent.total}</p>
              <p className="text-gray-400">Total</p>
              <div className="flex justify-center gap-2 mt-1">
                <span className="text-green-700 font-bold">{report.kpis.agent.exitosas}</span>
                <span className="text-red-600 font-bold">{report.kpis.agent.noExitosas}</span>
                <span className="text-gray-600 font-bold">{report.kpis.agent.quemadas}q</span>
              </div>
            </div>
          </div>

          {/* Two charts side by side — compact */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            {/* Trend Chart */}
            <div className="border rounded-lg p-2">
              <h3 className="text-[10px] font-semibold text-gray-600 mb-1">
                Tendencia {report.trendType === "daily" ? "Diaria" : "Mensual"}
              </h3>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={report.trend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 8 }} tickFormatter={(v) => report.trendType === "monthly" ? (MONTHS[v - 1]?.substring(0, 3) || v) : v} />
                  <YAxis yAxisId="left" tick={{ fontSize: 8 }} domain={[0, 100]} unit="%" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 8 }} />
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  <Bar yAxisId="right" dataKey="agentExitosas" name="Exitosas" fill="#22C55E" stackId="s" barSize={10} />
                  <Bar yAxisId="right" dataKey="agentNoExitosas" name="No Exit." fill="#EF4444" stackId="s" barSize={10} />
                  <Line yAxisId="left" type="monotone" dataKey="companyEfectividad" name="Cía %" stroke="#EA7704" strokeWidth={2} dot={{ r: 1.5 }}>
                    <LabelList dataKey="companyEfectividad" position="top" style={{ fontSize: 7, fill: "#000", fontWeight: 700 }} formatter={(v: number) => `${v}%`} />
                  </Line>
                  <Line yAxisId="left" type="monotone" dataKey="agentEfectividad" name="Agente %" stroke="#3B82F6" strokeWidth={2} dot={{ r: 1.5 }}>
                    <LabelList dataKey="agentEfectividad" position="bottom" style={{ fontSize: 7, fill: "#000", fontWeight: 700 }} formatter={(v: number) => `${v}%`} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Hourly Chart */}
            <div className="border rounded-lg p-2">
              <h3 className="text-[10px] font-semibold text-gray-600 mb-1">Distribución Horaria</h3>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={report.hourly} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 7 }} interval={1} />
                  <YAxis tick={{ fontSize: 8 }} />
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  <Bar dataKey="exitosas" name="Exitosas" fill="#22C55E" stackId="s" barSize={10} />
                  <Bar dataKey="noExitosas" name="No Exit." fill="#EF4444" stackId="s" barSize={10} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Results Breakdown — horizontal table */}
          <div className="border rounded-lg p-2 mb-1 overflow-hidden">
            <h3 className="text-[10px] font-semibold text-gray-600 mb-1">Desglose por Resultado</h3>
            <table className="w-full text-[9px]">
              <tbody>
                <tr>
                  {report.resultados.map((r) => (
                    <td key={r.tipoCierre} className={`px-1.5 py-1 border-r last:border-r-0 ${r.tipoCierre === "RECUPERADO WODEN" ? "bg-green-50" : ""}`}>
                      <p className="text-gray-600 leading-tight whitespace-nowrap">{r.tipoCierre}</p>
                      <p className="font-bold text-gray-900">{r.count} <span className="font-normal text-gray-400">({r.pct}%)</span></p>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t pt-1 flex justify-between text-[8px] text-gray-400">
            <p>No Exitosas incluye Quemadas. Quemadas = cierre a &gt; 500m del destino. Comparación vs promedio compañía por agente.</p>
            <p>Página 1 de 1</p>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #agent-report, #agent-report * { visibility: visible; }
          #agent-report { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .print\\:hidden { display: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
