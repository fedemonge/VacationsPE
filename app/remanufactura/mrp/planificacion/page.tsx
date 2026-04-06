"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ────────────── Types ────────────── */

type PlanningType = "demand" | "inventory" | "recovery";

interface UploadResult {
  rows: Record<string, string | number>[];
  columns: string[];
  errorCount: number;
  errors: string[];
  _allData?: Record<string, string | number>[];
}

interface CurrentDataSet {
  rows: Record<string, string | number>[];
  columns: string[];
  rawItems: any[];
}

type UploadState = "idle" | "uploading" | "preview" | "confirming" | "done";

const TABS: { label: string; type: PlanningType }[] = [
  { label: "Pronostico de Demanda", type: "demand" },
  { label: "Inventario", type: "inventory" },
  { label: "Pronostico de Recuperacion", type: "recovery" },
];

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/* ────────────── Component ────────────── */

export default function MRPPlanificacionPage() {
  const { authenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<PlanningType>("demand");

  /* Per-tab state */
  const [uploadState, setUploadState] = useState<Record<PlanningType, UploadState>>({
    demand: "idle",
    inventory: "idle",
    recovery: "idle",
  });
  const [files, setFiles] = useState<Record<PlanningType, File | null>>({
    demand: null,
    inventory: null,
    recovery: null,
  });
  const [previews, setPreviews] = useState<Record<PlanningType, UploadResult | null>>({
    demand: null,
    inventory: null,
    recovery: null,
  });
  const [currentData, setCurrentData] = useState<Record<PlanningType, CurrentDataSet | null>>({
    demand: null,
    inventory: null,
    recovery: null,
  });
  const [loadingData, setLoadingData] = useState<Record<PlanningType, boolean>>({
    demand: true,
    inventory: true,
    recovery: true,
  });
  const [errors, setErrors] = useState<Record<PlanningType, string | null>>({
    demand: null,
    inventory: null,
    recovery: null,
  });
  const [successMsg, setSuccessMsg] = useState<Record<PlanningType, string | null>>({
    demand: null,
    inventory: null,
    recovery: null,
  });

  /* ────────── Helpers ────────── */

  const formatCell = (value: string | number | undefined): string => {
    if (value === undefined || value === null) return "-";
    if (typeof value === "number") return value.toFixed(2);
    return String(value);
  };

  const formatMonth = (value: string | number | undefined): string => {
    if (value === undefined || value === null) return "-";
    const s = String(value);
    // Try to parse YYYY-MM format
    const match = s.match(/^(\d{4})-(\d{1,2})$/);
    if (match) {
      const monthIdx = parseInt(match[2]) - 1;
      if (monthIdx >= 0 && monthIdx < 12) return `${MONTHS[monthIdx]} ${match[1]}`;
    }
    return s;
  };

  /* ────────── API: Fetch current data ────────── */

  const fetchCurrentData = useCallback(async (type: PlanningType) => {
    setLoadingData((prev) => ({ ...prev, [type]: true }));
    try {
      const res = await fetch(`/api/remanufactura/mrp/planning/data?type=${type}`);
      if (!res.ok) throw new Error("Error al cargar datos");
      const raw = await res.json();
      // Transform flat array into { rows, columns } for display
      const items = Array.isArray(raw) ? raw : [];
      if (items.length === 0) {
        setCurrentData((prev) => ({ ...prev, [type]: { rows: [], columns: [], rawItems: [] } }));
      } else {
        const columnMap: Record<string, string> = {
          demand: "equipment,month,year,quantity",
          inventory: "material,month,year,quantityOnHand",
          recovery: "equipment,month,year,incomingUnits",
        };
        const cols = (columnMap[type] || "").split(",");
        const rows = items.map((item: any) => {
          const row: Record<string, string | number> = {};
          for (const col of cols) {
            if (col === "equipment") row["Equipo"] = item.equipment?.code || item.equipmentId || "—";
            else if (col === "material") row["Material"] = item.material?.code || item.materialId || "—";
            else if (col === "month") row["Mes"] = item.month;
            else if (col === "year") row["Año"] = item.year;
            else if (col === "quantity") row["Cantidad"] = item.quantity;
            else if (col === "quantityOnHand") row["Cant. Disponible"] = item.quantityOnHand;
            else if (col === "incomingUnits") row["Unid. Entrantes"] = item.incomingUnits;
          }
          return row;
        });
        const columns = Object.keys(rows[0] || {});
        setCurrentData((prev) => ({ ...prev, [type]: { rows, columns, rawItems: items } }));
      }
    } catch {
      setCurrentData((prev) => ({ ...prev, [type]: null }));
    } finally {
      setLoadingData((prev) => ({ ...prev, [type]: false }));
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    fetchCurrentData("demand");
    fetchCurrentData("inventory");
    fetchCurrentData("recovery");
  }, [authenticated, fetchCurrentData]);

  /* ────────── API: Download template ────────── */

  const downloadTemplate = async (type: PlanningType) => {
    try {
      const res = await fetch(`/api/remanufactura/mrp/planning/templates?type=${type}`);
      if (!res.ok) throw new Error("Error al descargar plantilla");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plantilla_${type}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [type]: e instanceof Error ? e.message : "Error" }));
    }
  };

  /* ────────── API: Upload file ────────── */

  const uploadFile = async (type: PlanningType) => {
    const file = files[type];
    if (!file) return;

    setUploadState((prev) => ({ ...prev, [type]: "uploading" }));
    setErrors((prev) => ({ ...prev, [type]: null }));
    setSuccessMsg((prev) => ({ ...prev, [type]: null }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const res = await fetch("/api/remanufactura/mrp/planning/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Error de servidor" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const raw = await res.json();
      // API returns { preview, headers, data, totalRows, errors }
      // Map to UploadResult { rows, columns, errorCount, errors }
      const result: UploadResult = {
        rows: raw.preview || raw.rows || raw.data?.slice(0, 10) || [],
        columns: raw.headers || raw.columns || (raw.preview?.[0] ? Object.keys(raw.preview[0]) : []),
        errorCount: raw.errors?.length ?? 0,
        errors: raw.errors || [],
        _allData: raw.data || raw.preview || [],
      };
      setPreviews((prev) => ({ ...prev, [type]: result }));
      setUploadState((prev) => ({ ...prev, [type]: "preview" }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [type]: e instanceof Error ? e.message : "Error desconocido" }));
      setUploadState((prev) => ({ ...prev, [type]: "idle" }));
    }
  };

  /* ────────── API: Confirm data ────────── */

  const confirmData = async (type: PlanningType) => {
    const preview = previews[type];
    if (!preview) return;

    setUploadState((prev) => ({ ...prev, [type]: "confirming" }));
    setErrors((prev) => ({ ...prev, [type]: null }));

    try {
      const res = await fetch("/api/remanufactura/mrp/planning/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, data: preview._allData || preview.rows }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Error de servidor" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      setUploadState((prev) => ({ ...prev, [type]: "done" }));
      setSuccessMsg((prev) => ({
        ...prev,
        [type]: `${preview.rows.length} registros guardados exitosamente.`,
      }));
      setPreviews((prev) => ({ ...prev, [type]: null }));
      setFiles((prev) => ({ ...prev, [type]: null }));
      fetchCurrentData(type);

      // Reset to idle after 3 seconds
      setTimeout(() => {
        setUploadState((prev) => ({ ...prev, [type]: "idle" }));
      }, 3000);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [type]: e instanceof Error ? e.message : "Error" }));
      setUploadState((prev) => ({ ...prev, [type]: "preview" }));
    }
  };

  /* ────────── Cancel / Reset ────────── */

  const cancelUpload = (type: PlanningType) => {
    setUploadState((prev) => ({ ...prev, [type]: "idle" }));
    setPreviews((prev) => ({ ...prev, [type]: null }));
    setFiles((prev) => ({ ...prev, [type]: null }));
    setErrors((prev) => ({ ...prev, [type]: null }));
  };

  /* ────────── Tab label map ────────── */

  const typeLabels: Record<PlanningType, string> = {
    demand: "Pronostico de Demanda",
    inventory: "Inventario",
    recovery: "Pronostico de Recuperacion",
  };

  /* ────────── Auth guard ────────── */

  if (!authenticated) {
    return <div className="p-8 text-center text-gray-500">Inicia sesion para acceder.</div>;
  }

  /* ────────── Render a single tab content ────────── */

  const renderTabContent = (type: PlanningType) => {
    const state = uploadState[type];
    const file = files[type];
    const preview = previews[type];
    const data = currentData[type];
    const loading = loadingData[type];
    const error = errors[type];
    const success = successMsg[type];

    return (
      <div className="space-y-6">
        {/* Upload section */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Cargar {typeLabels[type]}</h2>

          {/* Step 1: Download template + file input */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <button
              onClick={() => downloadTemplate(type)}
              className="btn-secondary px-4 py-2 text-sm whitespace-nowrap"
            >
              Descargar Plantilla
            </button>

            <div className="flex-1">
              <label className="label-field text-sm">Archivo (.xlsx, .xls, .csv)</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFiles((prev) => ({ ...prev, [type]: f }));
                  setErrors((prev) => ({ ...prev, [type]: null }));
                  setSuccessMsg((prev) => ({ ...prev, [type]: null }));
                  if (state !== "idle") {
                    setUploadState((prev) => ({ ...prev, [type]: "idle" }));
                    setPreviews((prev) => ({ ...prev, [type]: null }));
                  }
                }}
                className="input-field text-sm mt-1"
                disabled={state === "uploading" || state === "confirming"}
              />
              {file && (
                <p className="text-xs text-gray-500 mt-1">
                  {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>

            <button
              onClick={() => uploadFile(type)}
              disabled={!file || state === "uploading" || state === "confirming"}
              className="btn-primary px-6 py-2 text-sm disabled:opacity-50 whitespace-nowrap mt-5"
            >
              {state === "uploading" ? "Subiendo..." : "Subir y Previsualizar"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-sm text-sm text-green-700">
              {success}
            </div>
          )}

          {/* Step 2: Preview table */}
          {(state === "preview" || state === "confirming") && preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">
                    Vista previa ({preview.rows.length} filas)
                  </h3>
                  {preview.errorCount > 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      {preview.errorCount} error(es) encontrado(s)
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => cancelUpload(type)}
                    className="btn-secondary px-4 py-1.5 text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => confirmData(type)}
                    disabled={state === "confirming"}
                    className="btn-primary px-4 py-1.5 text-sm disabled:opacity-50"
                  >
                    {state === "confirming" ? "Confirmando..." : "Confirmar e Importar"}
                  </button>
                </div>
              </div>

              {/* Error details */}
              {preview.errors && preview.errors.length > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-sm">
                  <p className="text-xs font-semibold text-yellow-800 mb-1">Detalle de errores:</p>
                  <ul className="text-xs text-yellow-700 list-disc list-inside space-y-0.5">
                    {preview.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {preview.errors.length > 5 && (
                      <li>...y {preview.errors.length - 5} errores mas</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Preview data (first 10 rows) */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="table-header px-2 py-1 text-left text-xs">#</th>
                      {preview.columns.map((col) => (
                        <th key={col} className="table-header px-2 py-1 text-left text-xs">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="table-cell px-2 py-1 text-gray-400">{idx + 1}</td>
                        {preview.columns.map((col) => (
                          <td key={col} className="table-cell px-2 py-1">
                            {col.toLowerCase().includes("mes") || col.toLowerCase().includes("periodo")
                              ? formatMonth(row[col])
                              : formatCell(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 10 && (
                  <p className="text-xs text-gray-400 mt-2 px-2">
                    Mostrando 10 de {preview.rows.length} filas.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Current data */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Datos Actuales: {typeLabels[type]}</h2>
            <button
              onClick={() => fetchCurrentData(type)}
              className="text-sm text-gray-500 hover:text-woden-primary"
            >
              Actualizar
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Cargando datos...</p>
          ) : !data || data.rows.length === 0 ? (
            <p className="text-sm text-gray-400">No hay datos cargados para {typeLabels[type].toLowerCase()}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {data.columns.map((col) => (
                      <th key={col} className="table-header px-3 py-2 text-left">{col}</th>
                    ))}
                    <th className="table-header px-3 py-2 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, idx) => {
                    const rawItem = data.rawItems?.[idx];
                    const valueField = type === "demand" ? "quantity" : type === "inventory" ? "quantityOnHand" : "incomingUnits";
                    const valueCol = type === "demand" ? "Cantidad" : type === "inventory" ? "Cant. Disponible" : "Unid. Entrantes";
                    return (
                      <tr key={rawItem?.id || idx} className="hover:bg-gray-50">
                        {data.columns.map((col) => (
                          <td key={col} className="table-cell px-3 py-2">
                            {col === valueCol && rawItem ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={row[col]}
                                onBlur={async (e) => {
                                  const v = parseFloat(e.target.value);
                                  if (isNaN(v) || v === Number(row[col])) return;
                                  try {
                                    await fetch("/api/remanufactura/mrp/planning/data", {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ type, id: rawItem.id, [valueField]: v }),
                                    });
                                    fetchCurrentData(type);
                                  } catch { /* ignore */ }
                                }}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                className="input-field text-sm w-24 text-right"
                              />
                            ) : col.toLowerCase().includes("mes") || col.toLowerCase().includes("periodo")
                              ? formatMonth(row[col])
                              : formatCell(row[col])}
                          </td>
                        ))}
                        <td className="table-cell px-3 py-2">
                          {rawItem && (
                            <button
                              onClick={async () => {
                                if (!confirm("¿Eliminar este registro?")) return;
                                try {
                                  await fetch(`/api/remanufactura/mrp/planning/data?type=${type}&id=${rawItem.id}`, { method: "DELETE" });
                                  fetchCurrentData(type);
                                } catch { /* ignore */ }
                              }}
                              className="text-red-600 hover:text-red-800 text-xs"
                            >
                              Eliminar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">
                {data.rows.length} registro(s) en total.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ────────── Main render ────────── */

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planificacion MRP</h1>
          <p className="text-sm text-gray-500 mt-1">
            Carga de pronosticos de demanda, inventario actual y pronosticos de recuperacion
          </p>
        </div>
        <Link href="/remanufactura/mrp" className="text-sm text-gray-500 hover:text-woden-primary">
          &larr; Volver al MRP
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.type}
            onClick={() => setActiveTab(tab.type)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.type
                ? "border-woden-primary text-woden-primary"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {renderTabContent(activeTab)}
    </div>
  );
}
