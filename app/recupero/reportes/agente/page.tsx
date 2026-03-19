"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from "recharts";

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
      const res = await fetch(`/api/recupero/agent-report?${params}`);
      if (res.ok) {
        setReport(await res.json());
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [selectedAgent, year, month, day]);

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
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-[#EA7704] text-white rounded-lg hover:bg-[#d06a03] text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Imprimir
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-3">
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
        <div className="print:p-0" id="agent-report">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-[#EA7704] pb-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{report.agenteCampo}</h2>
              <p className="text-sm text-gray-500">Reporte de Efectividad — {periodLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Woden Peru — Recupero</p>
              <p className="text-xs text-gray-400">Generado: {new Date().toLocaleDateString("es-PE")}</p>
            </div>
          </div>

          {/* KPI Grid — Agent vs Company */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {kpiCompare("Total Gestiones", report.kpis.agent.total, report.kpis.company.avgPerAgent || 0)}
            {kpiCompare("Efectividad", report.kpis.agent.efectividad, report.kpis.company.efectividad, "pct")}
            {kpiCompare("Exitosas", report.kpis.agent.exitosas, Math.round((report.kpis.company.exitosas) / (report.kpis.company.numAgents || 1)))}
            {kpiCompare("Tasa Quemadas", report.kpis.agent.tasaQuemadas, report.kpis.company.tasaQuemadas, "pct")}
          </div>

          {/* Summary bar */}
          <div className="bg-gray-50 rounded-lg p-3 mb-4 grid grid-cols-5 gap-2 text-center text-xs">
            <div>
              <p className="font-bold text-gray-900 text-base">{report.kpis.agent.total}</p>
              <p className="text-gray-500">Total</p>
            </div>
            <div>
              <p className="font-bold text-green-700 text-base">{report.kpis.agent.exitosas}</p>
              <p className="text-gray-500">Exitosas</p>
            </div>
            <div>
              <p className="font-bold text-red-600 text-base">{report.kpis.agent.noExitosas}</p>
              <p className="text-gray-500">No Exitosas</p>
            </div>
            <div>
              <p className="font-bold text-gray-800 text-base">{report.kpis.agent.quemadas}</p>
              <p className="text-gray-500">Quemadas</p>
            </div>
            <div>
              <p className="font-bold text-yellow-600 text-base">{report.kpis.agent.sinCoords}</p>
              <p className="text-gray-500">Sin Coords</p>
            </div>
          </div>

          {/* Two charts side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Trend Chart */}
            <div className="border rounded-lg p-3">
              <h3 className="text-xs font-semibold text-gray-600 mb-2">
                Tendencia {report.trendType === "daily" ? "Diaria" : "Mensual"}
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={report.trend} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 9 }} domain={[0, 100]} unit="%" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="right" dataKey="agentExitosas" name="Exitosas" fill="#22C55E" stackId="s" barSize={14} />
                  <Bar yAxisId="right" dataKey="agentNoExitosas" name="No Exit." fill="#EF4444" stackId="s" barSize={14} />
                  <Line yAxisId="left" type="monotone" dataKey="companyEfectividad" name="Cía %" stroke="#EA7704" strokeWidth={2} dot={{ r: 2 }}>
                    <LabelList dataKey="companyEfectividad" position="top" style={{ fontSize: 8, fill: "#000", fontWeight: 700 }} formatter={(v: number) => `${v}%`} />
                  </Line>
                  <Line yAxisId="left" type="monotone" dataKey="agentEfectividad" name="Agente %" stroke="#3B82F6" strokeWidth={2} dot={{ r: 2 }}>
                    <LabelList dataKey="agentEfectividad" position="bottom" style={{ fontSize: 8, fill: "#000", fontWeight: 700 }} formatter={(v: number) => `${v}%`} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Hourly Chart */}
            <div className="border rounded-lg p-3">
              <h3 className="text-xs font-semibold text-gray-600 mb-2">Distribución Horaria</h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={report.hourly} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 8 }} interval={1} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="exitosas" name="Exitosas" fill="#22C55E" stackId="s" barSize={12} />
                  <Bar dataKey="noExitosas" name="No Exit." fill="#EF4444" stackId="s" barSize={12} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Results Breakdown */}
          <div className="border rounded-lg p-3 mb-4">
            <h3 className="text-xs font-semibold text-gray-600 mb-2">Desglose por Resultado</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {report.resultados.map((r) => (
                <div
                  key={r.tipoCierre}
                  className={`rounded px-2 py-1.5 text-xs ${
                    r.tipoCierre === "RECUPERADO WODEN"
                      ? "bg-green-50 border border-green-200"
                      : "bg-gray-50 border border-gray-200"
                  }`}
                >
                  <p className="font-medium text-gray-700 truncate">{r.tipoCierre}</p>
                  <p className="text-gray-900 font-bold">{r.count} <span className="font-normal text-gray-400">({r.pct}%)</span></p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t pt-2 flex justify-between text-[9px] text-gray-400">
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
