"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";

interface OrgNode {
  email: string;
  fullName: string;
  position: string;
  costCenter: string;
  costCenterDesc: string;
  employeeId: string;
  isOnVacation: boolean;
  vacationDateFrom?: string;
  vacationDateTo?: string;
  vacantPositions: {
    id: string;
    positionCode: string;
    title: string;
    positionType: string;
  }[];
  thirdParties: {
    id: string;
    positionCode: string;
    title: string;
    thirdPartyName: string;
    thirdPartyCompany: string;
  }[];
  children: OrgNode[];
}

interface OrgSummary {
  active: number;
  vacant: number;
  thirdParty: number;
  onVacation: number;
}

interface CostCenter {
  id: string;
  code: string;
  description: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
  });
}

/* ---------- Tree node component (top-down with connector lines) ---------- */
function OrgTreeNode({
  node,
  showVacant,
  showThirdParty,
}: {
  node: OrgNode;
  showVacant: boolean;
  showThirdParty: boolean;
}) {
  const childNodes = node.children;
  const vacants = showVacant ? node.vacantPositions : [];
  const thirds = showThirdParty ? node.thirdParties : [];
  const totalChildren = childNodes.length + vacants.length + thirds.length;

  return (
    <div className="org-node-wrapper">
      {/* The card itself */}
      <div
        className={`org-node-card ${
          node.isOnVacation ? "org-node-on-vacation" : ""
        }`}
      >
        <p className="font-semibold text-xs text-gray-900 leading-tight">
          {node.fullName}
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
          {node.position}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
          {node.costCenter}
          {node.costCenterDesc ? ` - ${node.costCenterDesc}` : ""}
        </p>
        {node.isOnVacation && node.vacationDateFrom && node.vacationDateTo && (
          <p className="text-[10px] text-amber-600 mt-1 font-medium">
            {formatDate(node.vacationDateFrom)} –{" "}
            {formatDate(node.vacationDateTo)}
          </p>
        )}
      </div>

      {/* Children with connector lines */}
      {totalChildren > 0 && (
        <div className="org-children">
          <div
            className={`org-children-row ${
              totalChildren === 1 ? "single-child" : ""
            }`}
          >
            {/* Employee children (recursive) */}
            {childNodes.map((child) => (
              <div className="org-branch" key={child.email}>
                <OrgTreeNode
                  node={child}
                  showVacant={showVacant}
                  showThirdParty={showThirdParty}
                />
              </div>
            ))}

            {/* Vacant position leaves */}
            {vacants.map((vp) => (
              <div className="org-branch" key={vp.id}>
                <div className="org-node-wrapper">
                  <div className="org-node-vacant">
                    <p className="text-xs font-medium text-gray-500 leading-tight">
                      {vp.title}
                    </p>
                    <div className="mt-1">
                      <span className="badge-vacante">VACANTE</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {vp.positionCode}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Third-party leaves */}
            {thirds.map((tp) => (
              <div className="org-branch" key={tp.id}>
                <div className="org-node-wrapper">
                  <div className="org-node-third-party">
                    <p className="text-xs font-medium text-gray-700 leading-tight">
                      {tp.thirdPartyName}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                      {tp.title}
                    </p>
                    <div className="mt-1">
                      <span className="badge-tercero">Tercero</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {tp.thirdPartyCompany}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrganigramaPage() {
  const { authenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [summary, setSummary] = useState<OrgSummary>({
    active: 0,
    vacant: 0,
    thirdParty: 0,
    onVacation: 0,
  });
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [selectedCostCenter, setSelectedCostCenter] = useState("");
  const [showVacant, setShowVacant] = useState(true);
  const [showThirdParty, setShowThirdParty] = useState(true);

  const loadCostCenters = useCallback(async () => {
    try {
      const res = await fetch("/api/centros-costos");
      const data = await res.json();
      setCostCenters(data.costCenters || []);
    } catch {
      // silent
    }
  }, []);

  const loadOrgChart = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedCostCenter
        ? `?costCenter=${encodeURIComponent(selectedCostCenter)}`
        : "";
      const res = await fetch(`/api/organigrama${params}`);
      const data = await res.json();
      setTree(data.tree || []);
      setSummary(
        data.summary || { active: 0, vacant: 0, thirdParty: 0, onVacation: 0 }
      );
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedCostCenter]);

  useEffect(() => {
    if (authenticated) loadCostCenters();
  }, [authenticated, loadCostCenters]);

  useEffect(() => {
    if (authenticated) loadOrgChart();
  }, [authenticated, loadOrgChart]);

  if (!authenticated) return null;

  return (
    <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Organigrama</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Estructura organizacional basada en la relación empleado-supervisor
      </p>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <label className="label-field">Centro de Costos</label>
            <select
              className="input-field"
              value={selectedCostCenter}
              onChange={(e) => setSelectedCostCenter(e.target.value)}
            >
              <option value="">Toda la Empresa</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.code}>
                  {cc.code} - {cc.description}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showVacant}
                onChange={(e) => setShowVacant(e.target.checked)}
                className="rounded border-gray-300 text-woden-primary focus:ring-woden-primary"
              />
              Vacantes
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showThirdParty}
                onChange={(e) => setShowThirdParty(e.target.checked)}
                className="rounded border-gray-300 text-woden-primary focus:ring-woden-primary"
              />
              Terceros
            </label>
          </div>
        </div>
      </div>

      {/* Summary badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center p-4">
          <p className="text-2xl font-bold text-green-600">{summary.active}</p>
          <p className="text-xs text-gray-500">Empleados Activos</p>
        </div>
        <div className="card text-center p-4">
          <p className="text-2xl font-bold text-gray-500">{summary.vacant}</p>
          <p className="text-xs text-gray-500">Posiciones Vacantes</p>
        </div>
        <div className="card text-center p-4">
          <p className="text-2xl font-bold text-purple-600">
            {summary.thirdParty}
          </p>
          <p className="text-xs text-gray-500">Terceros</p>
        </div>
        <div className="card text-center p-4">
          <p className="text-2xl font-bold text-amber-600">
            {summary.onVacation}
          </p>
          <p className="text-xs text-gray-500">En Vacaciones</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-white border border-gray-200 rounded-sm"></span>
          Empleado
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-amber-50 border-l-2 border-l-amber-400 border border-gray-200 rounded-sm"></span>
          En Vacaciones
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-gray-50 border border-dashed border-gray-400 rounded-sm"></span>
          Vacante
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-white border-l-2 border-l-purple-400 border border-gray-200 rounded-sm"></span>
          Tercero
        </span>
      </div>

      {/* Org Tree */}
      {loading ? (
        <div className="card text-center text-gray-400 py-12">
          Cargando organigrama...
        </div>
      ) : tree.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          No se encontraron empleados
          {selectedCostCenter
            ? " para el centro de costos seleccionado"
            : ""}
        </div>
      ) : (
        <div className="org-tree-wrapper border border-gray-200 rounded-sm bg-gray-50 p-6">
          {tree.map((root) => (
            <div key={root.email} className="org-tree">
              <OrgTreeNode
                node={root}
                showVacant={showVacant}
                showThirdParty={showThirdParty}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
