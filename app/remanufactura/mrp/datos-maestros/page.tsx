"use client";

import { useAuth } from "@/components/AuthProvider";
import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────── */

interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
  abbreviation: string;
  isActive: boolean;
}

interface Material {
  id: string;
  code: string;
  name: string;
  description: string;
  unitOfMeasure: string;
  leadTimeDays: number;
  safetyStockQty: number;
  abcClass: string;
  isRecoverable: boolean;
  recoveryYieldPct: number;
  mainSupplierId: string | null;
  backupSupplierId: string | null;
  mainSupplier?: { id: string; name: string } | null;
  backupSupplier?: { id: string; name: string } | null;
  isActive: boolean;
}

interface Equipment {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  recoveryYieldPct: number;
  rutaId: string | null;
  ruta?: { id: string; code: string; name: string } | null;
  _count?: { bomItems: number };
  isActive: boolean;
}

interface BomItem {
  id: string;
  equipmentId: string;
  materialId: string;
  material?: { id: string; code: string; name: string; unitOfMeasure: string } | null;
  quantityPerUnit: number;
}

interface Ruta {
  id: string;
  code: string;
  name: string;
  description: string;
  _count?: { steps: number; equipment: number };
  isActive: boolean;
}

interface RutaStep {
  id: string;
  rutaId: string;
  subProcessId: string | null;
  subProcess?: { id: string; code: string; name: string } | null;
  childRutaId: string | null;
  childRuta?: { id: string; code: string; name: string; _count?: { steps: number } } | null;
  sequenceOrder: number;
  laborHoursPerUnit: number;
  isParallel: boolean;
}

interface Supplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  currency: string;
  isActive: boolean;
  _count?: { supplierItems: number; mainMaterials: number; backupMaterials: number };
  materialCount?: number;
  mainMaterials?: any[];
  backupMaterials?: any[];
}

interface SupplierItem {
  id: string;
  supplierId: string;
  materialId: string;
  material?: { id: string; code: string; name: string } | null;
  unitOfMeasure: string;
  purchaseUnit: string;
  purchaseUnitQty: number;
  unitCost: number;
  moq: number;
  isPreferred: boolean;
}

interface SubProcess {
  id: string;
  code: string;
  name: string;
  description: string;
  defaultSequence: number;
  capacityPerHour: number;
  requiresSpecialist: boolean;
  isActive: boolean;
}

/* ────────────────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────────────────── */

const TABS = ["Materiales", "Equipos y BOM", "Rutas", "Proveedores", "Sub-Procesos"] as const;
type TabKey = (typeof TABS)[number];

const CATEGORIES = ["Decodificador", "Modem", "Router", "SIM", "Antena", "Otro"];
const ABC_CLASSES = ["", "A", "B", "C"];

/* ────────────────────────────────────────────────────────
   Page Component
   ──────────────────────────────────────────────────────── */

export default function MRPDatosMaestrosPage() {
  const { authenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("Materiales");

  /* ───── Shared state ───── */
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ───── Materials state ───── */
  const [uoms, setUoms] = useState<UnitOfMeasure[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingMat, setLoadingMat] = useState(true);
  const [showMatModal, setShowMatModal] = useState(false);
  const [editingMat, setEditingMat] = useState<Material | null>(null);
  const [matForm, setMatForm] = useState({
    code: "", name: "", description: "", unitOfMeasure: "unit", unitCost: "0", costPerQty: "1", leadTimeDays: "0",
    safetyStockQty: "0", abcClass: "", isRecoverable: false, recoveryYieldPct: "0",
    mainSupplierId: "", backupSupplierId: "",
  });

  /* ───── Equipment + BOM state ───── */
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loadingEquip, setLoadingEquip] = useState(true);
  const [expandedEquip, setExpandedEquip] = useState<string | null>(null);
  const [bomItems, setBomItems] = useState<BomItem[]>([]);
  const [loadingBom, setLoadingBom] = useState(false);
  const [showEquipModal, setShowEquipModal] = useState(false);
  const [showBomModal, setShowBomModal] = useState(false);
  const [editingEquip, setEditingEquip] = useState<Equipment | null>(null);
  const [equipForm, setEquipForm] = useState({
    code: "", name: "", description: "", category: "", recoveryYieldPct: "85", bomBaseQty: "1", rutaId: "",
  });
  const [bomForm, setBomForm] = useState({ bomType: "material" as "material" | "subassembly", materialId: "", childEquipmentId: "", quantityPerUnit: "1", qtyPer: "1" });
  const [editingBomId, setEditingBomId] = useState<string | null>(null);

  /* ───── Rutas + Steps state ───── */
  const [rutas, setRutas] = useState<Ruta[]>([]);
  const [loadingRutas, setLoadingRutas] = useState(true);
  const [expandedRuta, setExpandedRuta] = useState<string | null>(null);
  const [rutaSteps, setRutaSteps] = useState<RutaStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [showRutaModal, setShowRutaModal] = useState(false);
  const [showStepModal, setShowStepModal] = useState(false);
  const [editingRuta, setEditingRuta] = useState<Ruta | null>(null);
  const [rutaForm, setRutaForm] = useState({ code: "", name: "", description: "" });
  const [stepForm, setStepForm] = useState({
    stepType: "subprocess" as "subprocess" | "childruta",
    subProcessId: "", childRutaId: "", sequenceOrder: "10", laborHoursPerUnit: "0.5", isParallel: false,
  });

  /* ───── Suppliers + Items state ───── */
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSupp, setLoadingSupp] = useState(true);
  const [expandedSupp, setExpandedSupp] = useState<string | null>(null);
  const [supplierItems, setSupplierItems] = useState<SupplierItem[]>([]);
  const [loadingSuppItems, setLoadingSuppItems] = useState(false);
  const [showSuppModal, setShowSuppModal] = useState(false);
  const [showSuppItemModal, setShowSuppItemModal] = useState(false);
  const [editingSupp, setEditingSupp] = useState<Supplier | null>(null);
  const [suppForm, setSuppForm] = useState({
    name: "", contactName: "", email: "", phone: "", country: "Peru", currency: "PEN",
  });
  const [suppItemForm, setSuppItemForm] = useState({
    materialId: "", unitOfMeasure: "unit", purchaseUnit: "unit", purchaseUnitQty: "1",
    unitCost: "0", moq: "1", isPreferred: false,
  });

  /* ───── Sub-Processes state ───── */
  const [subProcesses, setSubProcesses] = useState<SubProcess[]>([]);
  const [loadingProc, setLoadingProc] = useState(true);
  const [showProcModal, setShowProcModal] = useState(false);
  const [editingProc, setEditingProc] = useState<SubProcess | null>(null);
  const [procForm, setProcForm] = useState({
    code: "", name: "", description: "", defaultSequence: "10", capacityPerHour: "1",
    stationCount: "1", personnelPerStation: "1", requiresSpecialist: false, isActive: true,
  });

  /* ════════════════════════════════════════════════════════
     API helper
     ════════════════════════════════════════════════════════ */

  const api = useCallback(async (url: string, options?: RequestInit) => {
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Error de servidor" }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }, []);

  /* ════════════════════════════════════════════════════════
     Materials CRUD
     ════════════════════════════════════════════════════════ */

  const fetchUoms = useCallback(async () => {
    try {
      const data = await api("/api/remanufactura/mrp/master-data/uom");
      setUoms(data);
    } catch { /* ignore */ }
  }, [api]);

  const fetchMaterials = useCallback(async () => {
    setLoadingMat(true);
    try {
      const data = await api("/api/remanufactura/mrp/master-data/materials");
      setMaterials(data);
    } catch { /* ignore */ } finally { setLoadingMat(false); }
  }, [api]);

  const saveMaterial = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        code: matForm.code,
        name: matForm.name,
        description: matForm.description,
        unitOfMeasure: matForm.unitOfMeasure,
        unitCost: parseFloat(matForm.unitCost) || 0,
        costPerQty: parseFloat(matForm.costPerQty) || 1,
        leadTimeDays: parseInt(matForm.leadTimeDays),
        safetyStockQty: parseFloat(matForm.safetyStockQty),
        abcClass: matForm.abcClass || null,
        isRecoverable: matForm.isRecoverable,
        recoveryYieldPct: matForm.isRecoverable ? (parseFloat(matForm.recoveryYieldPct) || 0) : null,
        mainSupplierId: matForm.mainSupplierId || null,
        backupSupplierId: matForm.backupSupplierId || null,
      };
      if (editingMat) {
        await api(`/api/remanufactura/mrp/master-data/materials/${editingMat.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        await api("/api/remanufactura/mrp/master-data/materials", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      setShowMatModal(false);
      setEditingMat(null);
      fetchMaterials();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  const deleteMaterial = async (id: string) => {
    if (!confirm("¿Eliminar este material?")) return;
    try {
      await api(`/api/remanufactura/mrp/master-data/materials/${id}`, { method: "DELETE" });
      fetchMaterials();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  };

  /* ════════════════════════════════════════════════════════
     Equipment CRUD
     ════════════════════════════════════════════════════════ */

  const fetchEquipment = useCallback(async () => {
    setLoadingEquip(true);
    try {
      const data = await api("/api/remanufactura/mrp/master-data/equipment");
      setEquipment(data);
    } catch { /* ignore */ } finally { setLoadingEquip(false); }
  }, [api]);

  const fetchBomItems = useCallback(async (equipmentId: string) => {
    setLoadingBom(true);
    try {
      const data = await api(`/api/remanufactura/mrp/master-data/bom?equipmentId=${equipmentId}`);
      setBomItems(data);
    } catch { /* ignore */ } finally { setLoadingBom(false); }
  }, [api]);

  const saveEquipment = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        code: equipForm.code,
        name: equipForm.name,
        description: equipForm.description,
        category: equipForm.category,
        recoveryYieldPct: parseFloat(equipForm.recoveryYieldPct),
        bomBaseQty: parseFloat(equipForm.bomBaseQty) || 1,
      };
      if (editingEquip) {
        await api(`/api/remanufactura/mrp/master-data/equipment/${editingEquip.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        await api("/api/remanufactura/mrp/master-data/equipment", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      setShowEquipModal(false);
      setEditingEquip(null);
      fetchEquipment();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  const deleteEquipment = async (id: string) => {
    if (!confirm("¿Eliminar este equipo y su BOM?")) return;
    try {
      await api(`/api/remanufactura/mrp/master-data/equipment/${id}`, { method: "DELETE" });
      if (expandedEquip === id) setExpandedEquip(null);
      fetchEquipment();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  };

  const openBomModal = (bi?: any) => {
    if (bi) {
      setEditingBomId(bi.id);
      setBomForm({
        bomType: bi.childEquipmentId ? "subassembly" : "material",
        materialId: bi.materialId || "",
        childEquipmentId: bi.childEquipmentId || "",
        quantityPerUnit: String(bi.quantityPerUnit),
        qtyPer: String(bi.qtyPer ?? 1),
      });
    } else {
      setEditingBomId(null);
      setBomForm({ bomType: "material", materialId: "", childEquipmentId: "", quantityPerUnit: "1", qtyPer: "1" });
    }
    setError(null);
    setShowBomModal(true);
  };

  const saveBomItem = async () => {
    if (!expandedEquip) return;
    setSaving(true);
    setError(null);
    try {
      if (editingBomId) {
        await api(`/api/remanufactura/mrp/master-data/bom/${editingBomId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantityPerUnit: parseFloat(bomForm.quantityPerUnit), qtyPer: parseFloat(bomForm.qtyPer) || 1 }),
        });
      } else {
        await api("/api/remanufactura/mrp/master-data/bom", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipmentId: expandedEquip,
            ...(bomForm.bomType === "material" ? { materialId: bomForm.materialId } : { childEquipmentId: bomForm.childEquipmentId }),
            quantityPerUnit: parseFloat(bomForm.quantityPerUnit),
            qtyPer: parseFloat(bomForm.qtyPer) || 1,
          }),
        });
      }
      setShowBomModal(false);
      setEditingBomId(null);
      fetchBomItems(expandedEquip);
      fetchEquipment();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  const updateBomField = async (id: string, field: string, value: number) => {
    try {
      await api(`/api/remanufactura/mrp/master-data/bom/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (expandedEquip) fetchBomItems(expandedEquip);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  };

  const deleteBomItem = async (id: string) => {
    if (!confirm("¿Eliminar este material del BOM?")) return;
    try {
      await api(`/api/remanufactura/mrp/master-data/bom/${id}`, { method: "DELETE" });
      if (expandedEquip) { fetchBomItems(expandedEquip); fetchEquipment(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  };

  /* ════════════════════════════════════════════════════════
     Rutas CRUD
     ════════════════════════════════════════════════════════ */

  const fetchRutas = useCallback(async () => {
    setLoadingRutas(true);
    try {
      const data = await api("/api/remanufactura/mrp/master-data/rutas");
      setRutas(data);
    } catch { /* ignore */ } finally { setLoadingRutas(false); }
  }, [api]);

  const fetchRutaSteps = useCallback(async (rutaId: string) => {
    setLoadingSteps(true);
    try {
      const data = await api(`/api/remanufactura/mrp/master-data/ruta-steps?rutaId=${rutaId}`);
      setRutaSteps(data);
    } catch { /* ignore */ } finally { setLoadingSteps(false); }
  }, [api]);

  const saveRuta = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        code: rutaForm.code,
        name: rutaForm.name,
        description: rutaForm.description,
      };
      if (editingRuta) {
        await api(`/api/remanufactura/mrp/master-data/rutas/${editingRuta.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        await api("/api/remanufactura/mrp/master-data/rutas", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      setShowRutaModal(false);
      setEditingRuta(null);
      fetchRutas();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  const deleteRuta = async (id: string) => {
    if (!confirm("¿Eliminar esta ruta y sus pasos?")) return;
    try {
      await api(`/api/remanufactura/mrp/master-data/rutas/${id}`, { method: "DELETE" });
      if (expandedRuta === id) setExpandedRuta(null);
      fetchRutas();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  };

  const saveRutaStep = async () => {
    if (!expandedRuta) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        rutaId: expandedRuta,
        ...(stepForm.stepType === "subprocess"
          ? { subProcessId: stepForm.subProcessId }
          : { childRutaId: stepForm.childRutaId }),
        sequenceOrder: parseInt(stepForm.sequenceOrder),
        laborHoursPerUnit: stepForm.stepType === "subprocess" ? parseFloat(stepForm.laborHoursPerUnit) : 0,
        isParallel: stepForm.isParallel,
      };
      await api("/api/remanufactura/mrp/master-data/ruta-steps", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setShowStepModal(false);
      fetchRutaSteps(expandedRuta);
      fetchRutas();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  const deleteRutaStep = async (id: string) => {
    if (!confirm("¿Eliminar este paso de la ruta?")) return;
    try {
      await api(`/api/remanufactura/mrp/master-data/ruta-steps/${id}`, { method: "DELETE" });
      if (expandedRuta) { fetchRutaSteps(expandedRuta); fetchRutas(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  };

  /* ════════════════════════════════════════════════════════
     Supplier CRUD
     ════════════════════════════════════════════════════════ */

  const fetchSuppliers = useCallback(async () => {
    setLoadingSupp(true);
    try {
      const data = await api("/api/remanufactura/mrp/master-data/suppliers");
      setSuppliers(data);
    } catch { /* ignore */ } finally { setLoadingSupp(false); }
  }, [api]);

  const fetchSupplierItems = useCallback(async (supplierId: string) => {
    setLoadingSuppItems(true);
    try {
      const data = await api(`/api/remanufactura/mrp/master-data/supplier-items?supplierId=${supplierId}`);
      setSupplierItems(data);
    } catch { /* ignore */ } finally { setLoadingSuppItems(false); }
  }, [api]);

  const saveSupplier = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: suppForm.name,
        contactName: suppForm.contactName,
        email: suppForm.email,
        phone: suppForm.phone,
        country: suppForm.country,
        currency: suppForm.currency,
      };
      if (editingSupp) {
        await api(`/api/remanufactura/mrp/master-data/suppliers/${editingSupp.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        await api("/api/remanufactura/mrp/master-data/suppliers", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      setShowSuppModal(false);
      setEditingSupp(null);
      fetchSuppliers();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  const deleteSupplier = async (id: string) => {
    if (!confirm("¿Eliminar este proveedor y sus items?")) return;
    try {
      await api(`/api/remanufactura/mrp/master-data/suppliers/${id}`, { method: "DELETE" });
      if (expandedSupp === id) setExpandedSupp(null);
      fetchSuppliers();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  };

  const saveSupplierItem = async () => {
    if (!expandedSupp) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        supplierId: expandedSupp,
        materialId: suppItemForm.materialId,
        unitOfMeasure: suppItemForm.unitOfMeasure,
        purchaseUnit: suppItemForm.purchaseUnit,
        purchaseUnitQty: parseFloat(suppItemForm.purchaseUnitQty),
        unitCost: parseFloat(suppItemForm.unitCost),
        moq: parseInt(suppItemForm.moq),
        isPreferred: suppItemForm.isPreferred,
      };
      await api("/api/remanufactura/mrp/master-data/supplier-items", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setShowSuppItemModal(false);
      fetchSupplierItems(expandedSupp);
      fetchSuppliers();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  const deleteSupplierItem = async (id: string) => {
    if (!confirm("¿Eliminar este item del proveedor?")) return;
    try {
      await api(`/api/remanufactura/mrp/master-data/supplier-items/${id}`, { method: "DELETE" });
      if (expandedSupp) { fetchSupplierItems(expandedSupp); fetchSuppliers(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  };

  /* ════════════════════════════════════════════════════════
     Sub-Process CRUD
     ════════════════════════════════════════════════════════ */

  const fetchSubProcesses = useCallback(async () => {
    setLoadingProc(true);
    try {
      const data = await api("/api/remanufactura/mrp/master-data/processes");
      setSubProcesses(data);
    } catch { /* ignore */ } finally { setLoadingProc(false); }
  }, [api]);

  const saveSubProcess = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        code: procForm.code,
        name: procForm.name,
        description: procForm.description,
        defaultSequence: parseInt(procForm.defaultSequence),
        capacityPerHour: parseFloat(procForm.capacityPerHour),
        stationCount: parseInt(procForm.stationCount) || 1,
        personnelPerStation: parseInt(procForm.personnelPerStation) || 1,
        requiresSpecialist: procForm.requiresSpecialist,
        isActive: procForm.isActive,
      };
      if (editingProc) {
        await api(`/api/remanufactura/mrp/master-data/processes/${editingProc.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        await api("/api/remanufactura/mrp/master-data/processes", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      setShowProcModal(false);
      setEditingProc(null);
      fetchSubProcesses();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  const deleteSubProcess = async (id: string) => {
    if (!confirm("¿Eliminar este sub-proceso?")) return;
    try {
      await api(`/api/remanufactura/mrp/master-data/processes/${id}`, { method: "DELETE" });
      fetchSubProcesses();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  };

  /* ════════════════════════════════════════════════════════
     Effects
     ════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!authenticated) return;
    fetchUoms();
    fetchMaterials();
    fetchEquipment();
    fetchRutas();
    fetchSuppliers();
    fetchSubProcesses();
  }, [authenticated, fetchUoms, fetchMaterials, fetchEquipment, fetchRutas, fetchSuppliers, fetchSubProcesses]);

  useEffect(() => {
    if (expandedEquip) fetchBomItems(expandedEquip);
  }, [expandedEquip, fetchBomItems]);

  useEffect(() => {
    if (expandedRuta) fetchRutaSteps(expandedRuta);
  }, [expandedRuta, fetchRutaSteps]);

  useEffect(() => {
    if (expandedSupp) fetchSupplierItems(expandedSupp);
  }, [expandedSupp, fetchSupplierItems]);

  /* ════════════════════════════════════════════════════════
     Modal openers
     ════════════════════════════════════════════════════════ */

  const openMatModal = (m?: Material) => {
    if (m) {
      setEditingMat(m);
      setMatForm({
        code: m.code, name: m.name, description: m.description || "",
        unitOfMeasure: m.unitOfMeasure, unitCost: String((m as any).unitCost ?? 0), costPerQty: String((m as any).costPerQty ?? 1), leadTimeDays: String(m.leadTimeDays ?? 0),
        safetyStockQty: String(m.safetyStockQty ?? 0), abcClass: m.abcClass || "",
        isRecoverable: m.isRecoverable, recoveryYieldPct: String(m.recoveryYieldPct ?? 0),
        mainSupplierId: m.mainSupplierId || "", backupSupplierId: m.backupSupplierId || "",
      });
    } else {
      setEditingMat(null);
      setMatForm({
        code: "", name: "", description: "", unitOfMeasure: "unit", unitCost: "0", costPerQty: "1", leadTimeDays: "0",
        safetyStockQty: "0", abcClass: "", isRecoverable: false, recoveryYieldPct: "0",
        mainSupplierId: "", backupSupplierId: "",
      });
    }
    setError(null);
    setShowMatModal(true);
  };

  const openEquipModal = (eq?: Equipment) => {
    if (eq) {
      setEditingEquip(eq);
      setEquipForm({
        code: eq.code, name: eq.name, description: eq.description || "",
        category: eq.category, recoveryYieldPct: String(eq.recoveryYieldPct),
        bomBaseQty: String((eq as any).bomBaseQty ?? 1), rutaId: eq.rutaId || "",
      });
    } else {
      setEditingEquip(null);
      setEquipForm({ code: "", name: "", description: "", category: "", recoveryYieldPct: "85", bomBaseQty: "1", rutaId: "" });
    }
    setError(null);
    setShowEquipModal(true);
  };


  const openRutaModal = (r?: Ruta) => {
    if (r) {
      setEditingRuta(r);
      setRutaForm({ code: r.code, name: r.name, description: r.description || "" });
    } else {
      setEditingRuta(null);
      setRutaForm({ code: "", name: "", description: "" });
    }
    setError(null);
    setShowRutaModal(true);
  };

  const openStepModal = () => {
    setStepForm({ stepType: "subprocess", subProcessId: "", childRutaId: "", sequenceOrder: "10", laborHoursPerUnit: "0.5", isParallel: false });
    setError(null);
    setShowStepModal(true);
  };

  const openSuppModal = (s?: Supplier) => {
    if (s) {
      setEditingSupp(s);
      setSuppForm({
        name: s.name, contactName: s.contactName, email: s.email,
        phone: s.phone, country: s.country, currency: s.currency,
      });
    } else {
      setEditingSupp(null);
      setSuppForm({ name: "", contactName: "", email: "", phone: "", country: "Peru", currency: "PEN" });
    }
    setError(null);
    setShowSuppModal(true);
  };

  const openSuppItemModal = () => {
    setSuppItemForm({
      materialId: "", unitOfMeasure: "unit", purchaseUnit: "unit", purchaseUnitQty: "1",
      unitCost: "0", moq: "1", isPreferred: false,
    });
    setError(null);
    setShowSuppItemModal(true);
  };

  const openProcModal = (p?: SubProcess) => {
    if (p) {
      setEditingProc(p);
      setProcForm({
        code: p.code, name: p.name, description: p.description || "",
        defaultSequence: String(p.defaultSequence), capacityPerHour: String(p.capacityPerHour),
        stationCount: String((p as any).stationCount ?? 1), personnelPerStation: String((p as any).personnelPerStation ?? 1),
        requiresSpecialist: p.requiresSpecialist, isActive: p.isActive,
      });
    } else {
      setEditingProc(null);
      setProcForm({
        code: "", name: "", description: "", defaultSequence: "10",
        capacityPerHour: "1", stationCount: "1", personnelPerStation: "1",
        requiresSpecialist: false, isActive: true,
      });
    }
    setError(null);
    setShowProcModal(true);
  };

  /* ════════════════════════════════════════════════════════
     Auth guard
     ════════════════════════════════════════════════════════ */

  if (!authenticated) {
    return <div className="p-8 text-center text-gray-500">Inicia sesion para acceder.</div>;
  }

  /* ════════════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════════════ */

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Datos Maestros MRP</h1>
          <p className="text-sm text-gray-500 mt-1">Materiales, equipos, rutas, proveedores y sub-procesos de remanufactura</p>
        </div>
        <Link href="/remanufactura/mrp" className="text-sm text-gray-500 hover:text-woden-primary">
          &larr; Volver al MRP
        </Link>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-sm text-red-700 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold ml-4">&times;</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-woden-primary text-woden-primary"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
         Tab 1: Materiales
         ═══════════════════════════════════════════════════ */}
      {activeTab === "Materiales" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Materiales</h2>
            <button onClick={() => openMatModal()} className="btn-primary px-4 py-2 text-sm">
              + Nuevo Material
            </button>
          </div>

          {loadingMat ? (
            <p className="text-sm text-gray-400">Cargando materiales...</p>
          ) : materials.length === 0 ? (
            <p className="text-sm text-gray-400">No hay materiales registrados.</p>
          ) : (
            <div className="card overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {["Codigo", "Nombre", "UdM", "Costo Unit.", "Lead Time (dias)", "Stock Seguridad", "ABC", "Recuperable", "% Recuperacion", "Proveedor Principal", "Proveedor Backup", "Activo", "Acciones"].map((h) => (
                      <th key={h} className="table-header px-3 py-2 text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="table-cell px-3 py-2 font-mono">{m.code}</td>
                      <td className="table-cell px-3 py-2">{m.name}</td>
                      <td className="table-cell px-3 py-2">{m.unitOfMeasure}</td>
                      <td className="table-cell px-3 py-2 text-right">${((m as any).unitCost ?? 0).toFixed(2)} / {(m as any).costPerQty ?? 1}</td>
                      <td className="table-cell px-3 py-2 text-right">{m.leadTimeDays}</td>
                      <td className="table-cell px-3 py-2 text-right">{m.safetyStockQty.toFixed(2)}</td>
                      <td className="table-cell px-3 py-2 text-center">{m.abcClass || "—"}</td>
                      <td className="table-cell px-3 py-2 text-center">{m.isRecoverable ? "Si" : "No"}</td>
                      <td className="table-cell px-3 py-2 text-right">{m.isRecoverable ? `${m.recoveryYieldPct.toFixed(2)}%` : "—"}</td>
                      <td className="table-cell px-3 py-2">{m.mainSupplier?.name || "—"}</td>
                      <td className="table-cell px-3 py-2">{m.backupSupplier?.name || "—"}</td>
                      <td className="table-cell px-3 py-2 text-center">{m.isActive ? "Si" : "No"}</td>
                      <td className="table-cell px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openMatModal(m)}
                            className="text-blue-600 hover:text-blue-800 text-xs"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteMaterial(m.id)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
         Tab 2: Equipos y BOM
         ═══════════════════════════════════════════════════ */}
      {activeTab === "Equipos y BOM" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Equipos</h2>
            <button onClick={() => openEquipModal()} className="btn-primary px-4 py-2 text-sm">
              + Nuevo Equipo
            </button>
          </div>

          {loadingEquip ? (
            <p className="text-sm text-gray-400">Cargando equipos...</p>
          ) : equipment.length === 0 ? (
            <p className="text-sm text-gray-400">No hay equipos registrados.</p>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {["Codigo", "Nombre", "Categoria", "% Rendimiento", "Base BOM", "Rutas", "BOM Items", "Activo", "Acciones"].map((h) => (
                      <th key={h} className="table-header px-3 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((eq) => (
                    <Fragment key={eq.id}>
                      <tr
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => setExpandedEquip(expandedEquip === eq.id ? null : eq.id)}
                      >
                        <td className="table-cell px-3 py-2 font-mono">
                          <span className={`inline-block mr-2 text-xs transition-transform ${expandedEquip === eq.id ? "rotate-90" : ""}`}>&#9654;</span>
                          {eq.code}
                        </td>
                        <td className="table-cell px-3 py-2">{eq.name}</td>
                        <td className="table-cell px-3 py-2">{eq.category}</td>
                        <td className="table-cell px-3 py-2 text-right">{eq.recoveryYieldPct.toFixed(2)}%</td>
                        <td className="table-cell px-3 py-2 text-center">{(eq as any).bomBaseQty ?? 1}</td>
                        <td className="table-cell px-3 py-2 text-center">{(eq as any).equipmentRutas?.length ?? 0}</td>
                        <td className="table-cell px-3 py-2 text-center">{eq._count?.bomItems ?? 0}</td>
                        <td className="table-cell px-3 py-2 text-center">{eq.isActive ? "Si" : "No"}</td>
                        <td className="table-cell px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEquipModal(eq); }}
                              className="text-blue-600 hover:text-blue-800 text-xs"
                            >
                              Editar
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteEquipment(eq.id); }}
                              className="text-red-600 hover:text-red-800 text-xs"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded: Rutas + BOM */}
                      {expandedEquip === eq.id && (
                        <tr>
                          <td colSpan={9} className="bg-gray-50 px-6 py-4 space-y-4">
                            {/* Rutas assigned */}
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <h3 className="text-sm font-semibold text-gray-700">Rutas de {eq.name}</h3>
                                <div className="flex items-center gap-2">
                                  <select id={`ruta-select-${eq.id}`} className="input-field text-xs py-1">
                                    <option value="">Seleccionar ruta...</option>
                                    {rutas.filter((r) => r.isActive && !(eq as any).equipmentRutas?.some((er: any) => er.rutaId === r.id || er.ruta?.id === r.id)).map((r) => (
                                      <option key={r.id} value={r.id}>{r.code} - {r.name}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={async () => {
                                      const sel = (document.getElementById(`ruta-select-${eq.id}`) as HTMLSelectElement)?.value;
                                      if (!sel) return;
                                      const seq = ((eq as any).equipmentRutas?.length ?? 0) + 1;
                                      try {
                                        await api("/api/remanufactura/mrp/master-data/equipment-rutas", {
                                          method: "POST", headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ equipmentId: eq.id, rutaId: sel, sequenceOrder: seq * 10 }),
                                        });
                                        fetchEquipment();
                                      } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
                                    }}
                                    className="btn-secondary px-2 py-1 text-xs"
                                  >+ Agregar</button>
                                </div>
                              </div>
                              {((eq as any).equipmentRutas?.length ?? 0) === 0 ? (
                                <p className="text-xs text-gray-400">Sin rutas asignadas.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {(eq as any).equipmentRutas.map((er: any, idx: number) => (
                                    <div key={er.id} className="inline-flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-sm px-2 py-1 text-xs">
                                      <span className="text-gray-400 font-mono">{idx + 1}.</span>
                                      <span className="font-medium text-gray-700">{er.ruta?.code || "?"} - {er.ruta?.name || "?"}</span>
                                      <button
                                        onClick={async () => {
                                          try {
                                            await fetch(`/api/remanufactura/mrp/master-data/equipment-rutas?id=${er.id}`, { method: "DELETE" });
                                            fetchEquipment();
                                          } catch { /* ignore */ }
                                        }}
                                        className="text-red-400 hover:text-red-600 ml-1"
                                      >&times;</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* BOM section */}
                            <div>
                            <div className="flex justify-between items-center mb-3">
                              <h3 className="text-sm font-semibold text-gray-700">
                                BOM de {eq.name}
                              </h3>
                              <button onClick={openBomModal} className="btn-secondary px-3 py-1 text-xs">
                                + Agregar Material al BOM
                              </button>
                            </div>
                            {loadingBom ? (
                              <p className="text-xs text-gray-400">Cargando...</p>
                            ) : bomItems.length === 0 ? (
                              <p className="text-xs text-gray-400">Sin materiales en el BOM.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    {["Material", "UdM", "Cantidad", "Por (equipo)", "Acciones"].map((h) => (
                                      <th key={h} className="table-header px-2 py-1 text-left">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {bomItems.map((bi) => (
                                    <tr key={bi.id} className="hover:bg-white">
                                      <td className="table-cell px-2 py-1">
                                        {(bi as any).childEquipment ? (
                                          <span className="inline-flex items-center gap-1">
                                            <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-sm font-medium">SUB-ENS</span>
                                            {(bi as any).childEquipment.code} - {(bi as any).childEquipment.name}
                                          </span>
                                        ) : bi.material ? `${bi.material.code} - ${bi.material.name}` : "—"}
                                      </td>
                                      <td className="table-cell px-2 py-1">{(bi as any).childEquipment ? "equipo" : (bi.material?.unitOfMeasure || "—")}</td>
                                      <td className="table-cell px-2 py-1 text-right">
                                        <input
                                          type="number"
                                          min="0.01"
                                          step="0.01"
                                          defaultValue={bi.quantityPerUnit}
                                          onBlur={(e) => {
                                            const v = parseFloat(e.target.value);
                                            if (!isNaN(v) && v > 0 && v !== bi.quantityPerUnit) updateBomField(bi.id, "quantityPerUnit", v);
                                          }}
                                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                          className="input-field text-sm w-20 text-right"
                                        />
                                      </td>
                                      <td className="table-cell px-2 py-1 text-right">
                                        <input
                                          type="number"
                                          min="1"
                                          step="1"
                                          defaultValue={(bi as any).qtyPer ?? 1}
                                          onBlur={(e) => {
                                            const v = parseFloat(e.target.value);
                                            if (!isNaN(v) && v >= 1 && v !== ((bi as any).qtyPer ?? 1)) updateBomField(bi.id, "qtyPer", v);
                                          }}
                                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                          className="input-field text-sm w-20 text-right"
                                        />
                                      </td>
                                      <td className="table-cell px-2 py-1">
                                        <div className="flex gap-2">
                                          <button onClick={() => openBomModal(bi)} className="text-blue-600 hover:text-blue-800 text-xs">Editar</button>
                                          <button onClick={() => deleteBomItem(bi.id)} className="text-red-600 hover:text-red-800 text-xs">Eliminar</button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            </div>{/* close BOM div */}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
         Tab 3: Rutas
         ═══════════════════════════════════════════════════════ */}
      {activeTab === "Rutas" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Rutas</h2>
            <button onClick={() => openRutaModal()} className="btn-primary px-4 py-2 text-sm">
              + Nueva Ruta
            </button>
          </div>

          {loadingRutas ? (
            <p className="text-sm text-gray-400">Cargando rutas...</p>
          ) : rutas.length === 0 ? (
            <p className="text-sm text-gray-400">No hay rutas registradas.</p>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {["Codigo", "Nombre", "Descripcion", "Pasos", "Equipos Asignados", "Activo", "Acciones"].map((h) => (
                      <th key={h} className="table-header px-3 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rutas.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => setExpandedRuta(expandedRuta === r.id ? null : r.id)}
                      >
                        <td className="table-cell px-3 py-2 font-mono">
                          <span className={`inline-block mr-2 text-xs transition-transform ${expandedRuta === r.id ? "rotate-90" : ""}`}>&#9654;</span>
                          {r.code}
                        </td>
                        <td className="table-cell px-3 py-2">{r.name}</td>
                        <td className="table-cell px-3 py-2 text-gray-500">{r.description || "—"}</td>
                        <td className="table-cell px-3 py-2 text-center">{r._count?.steps ?? 0}</td>
                        <td className="table-cell px-3 py-2 text-center">{r._count?.equipment ?? 0}</td>
                        <td className="table-cell px-3 py-2 text-center">{r.isActive ? "Si" : "No"}</td>
                        <td className="table-cell px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); openRutaModal(r); }}
                              className="text-blue-600 hover:text-blue-800 text-xs"
                            >
                              Editar
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteRuta(r.id); }}
                              className="text-red-600 hover:text-red-800 text-xs"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded: Ruta Steps sub-table */}
                      {expandedRuta === r.id && (
                        <tr>
                          <td colSpan={7} className="bg-gray-50 px-6 py-4">
                            <div className="flex justify-between items-center mb-3">
                              <h3 className="text-sm font-semibold text-gray-700">
                                Pasos de {r.name}
                              </h3>
                              <button onClick={openStepModal} className="btn-secondary px-3 py-1 text-xs">
                                + Agregar Paso
                              </button>
                            </div>
                            {loadingSteps ? (
                              <p className="text-xs text-gray-400">Cargando...</p>
                            ) : rutaSteps.length === 0 ? (
                              <p className="text-xs text-gray-400">Sin pasos definidos.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    {["Secuencia", "Sub-Proceso", "Horas/Unidad", "Paralelo", "Acciones"].map((h) => (
                                      <th key={h} className="table-header px-2 py-1 text-left">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {rutaSteps.map((step) => (
                                    <tr key={step.id} className="hover:bg-white">
                                      <td className="table-cell px-2 py-1 text-center">{step.sequenceOrder}</td>
                                      <td className="table-cell px-2 py-1">
                                        {step.childRuta ? (
                                          <span className="inline-flex items-center gap-1">
                                            <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded-sm font-medium">RUTA</span>
                                            {step.childRuta.code} - {step.childRuta.name}
                                            <span className="text-gray-400 text-[10px]">({step.childRuta._count?.steps ?? 0} pasos)</span>
                                          </span>
                                        ) : step.subProcess ? (
                                          `${step.subProcess.code} - ${step.subProcess.name}`
                                        ) : "—"}
                                      </td>
                                      <td className="table-cell px-2 py-1 text-right">
                                        {step.childRuta ? <span className="text-gray-400 text-xs">heredado</span> : (step.laborHoursPerUnit ?? 0).toFixed(2)}
                                      </td>
                                      <td className="table-cell px-2 py-1 text-center">{step.isParallel ? "Si" : "No"}</td>
                                      <td className="table-cell px-2 py-1">
                                        <button onClick={() => deleteRutaStep(step.id)} className="text-red-600 hover:text-red-800">Eliminar</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
         Tab 4: Proveedores
         ═══════════════════════════════════════════════════ */}
      {activeTab === "Proveedores" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Proveedores</h2>
            <button onClick={() => openSuppModal()} className="btn-primary px-4 py-2 text-sm">
              + Nuevo Proveedor
            </button>
          </div>

          {loadingSupp ? (
            <p className="text-sm text-gray-400">Cargando proveedores...</p>
          ) : suppliers.length === 0 ? (
            <p className="text-sm text-gray-400">No hay proveedores registrados.</p>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {["Nombre", "Contacto", "Email", "Pais", "Moneda", "Materiales", "Activo", "Acciones"].map((h) => (
                      <th key={h} className="table-header px-3 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <Fragment key={s.id}>
                      <tr
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => setExpandedSupp(expandedSupp === s.id ? null : s.id)}
                      >
                        <td className="table-cell px-3 py-2 font-medium">
                          <span className={`inline-block mr-2 text-xs transition-transform ${expandedSupp === s.id ? "rotate-90" : ""}`}>&#9654;</span>
                          {s.name}
                        </td>
                        <td className="table-cell px-3 py-2">{s.contactName}</td>
                        <td className="table-cell px-3 py-2">{s.email}</td>
                        <td className="table-cell px-3 py-2">{s.country}</td>
                        <td className="table-cell px-3 py-2">{s.currency}</td>
                        <td className="table-cell px-3 py-2 text-center">{(s as any).materialCount ?? s._count?.supplierItems ?? 0}</td>
                        <td className="table-cell px-3 py-2 text-center">{s.isActive ? "Si" : "No"}</td>
                        <td className="table-cell px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); openSuppModal(s); }}
                              className="text-blue-600 hover:text-blue-800 text-xs"
                            >
                              Editar
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteSupplier(s.id); }}
                              className="text-red-600 hover:text-red-800 text-xs"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded: Materials assigned to this supplier */}
                      {expandedSupp === s.id && (
                        <tr>
                          <td colSpan={9} className="bg-gray-50 px-6 py-4">
                            <div className="mb-3">
                              <h3 className="text-sm font-semibold text-gray-700">
                                Materiales de {s.name}
                              </h3>
                            </div>
                            {(() => {
                              const mainMats = (s as any).mainMaterials || [];
                              const backupMats = (s as any).backupMaterials || [];
                              const allMats = [
                                ...mainMats.map((m: any) => ({ ...m, role: "Principal" })),
                                ...backupMats.map((m: any) => ({ ...m, role: "Backup" })),
                              ];
                              if (allMats.length === 0) return <p className="text-xs text-gray-400">Sin materiales asignados. Asigne este proveedor en la pestaña Materiales.</p>;
                              return (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr>
                                      {["Codigo", "Material", "UdM", "Lead Time", "Rol"].map((h) => (
                                        <th key={h} className="table-header px-2 py-1 text-left">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {allMats.map((m: any) => (
                                      <tr key={`${m.id}-${m.role}`} className="hover:bg-white">
                                        <td className="table-cell px-2 py-1 font-mono">{m.code}</td>
                                        <td className="table-cell px-2 py-1">{m.name}</td>
                                        <td className="table-cell px-2 py-1">{m.unitOfMeasure}</td>
                                        <td className="table-cell px-2 py-1 text-center">{m.leadTimeDays} dias</td>
                                        <td className="table-cell px-2 py-1">
                                          <span className={`text-xs px-2 py-0.5 rounded-sm ${m.role === "Principal" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}`}>
                                            {m.role}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
         Tab 5: Sub-Procesos
         ═══════════════════════════════════════════════════ */}
      {activeTab === "Sub-Procesos" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Sub-Procesos</h2>
            <button onClick={() => openProcModal()} className="btn-primary px-4 py-2 text-sm">
              + Nuevo Sub-Proceso
            </button>
          </div>

          {loadingProc ? (
            <p className="text-sm text-gray-400">Cargando sub-procesos...</p>
          ) : subProcesses.length === 0 ? (
            <p className="text-sm text-gray-400">No hay sub-procesos registrados.</p>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {["Codigo", "Nombre", "Secuencia", "Cap/Hora", "Estaciones", "Pers/Estacion", "Especialista", "Activo", "Acciones"].map((h) => (
                      <th key={h} className="table-header px-3 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subProcesses.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="table-cell px-3 py-2 font-mono">{p.code}</td>
                      <td className="table-cell px-3 py-2">{p.name}</td>
                      <td className="table-cell px-3 py-2 text-center">{p.defaultSequence}</td>
                      <td className="table-cell px-3 py-2 text-right">{p.capacityPerHour.toFixed(2)}</td>
                      <td className="table-cell px-3 py-2 text-center">{(p as any).stationCount ?? 1}</td>
                      <td className="table-cell px-3 py-2 text-center">{(p as any).personnelPerStation ?? 1}</td>
                      <td className="table-cell px-3 py-2 text-center">{p.requiresSpecialist ? "Si" : "No"}</td>
                      <td className="table-cell px-3 py-2 text-center">{p.isActive ? "Si" : "No"}</td>
                      <td className="table-cell px-3 py-2">
                        <div className="flex gap-2">
                          <button onClick={() => openProcModal(p)} className="text-blue-600 hover:text-blue-800 text-xs">Editar</button>
                          <button onClick={() => deleteSubProcess(p.id)} className="text-red-600 hover:text-red-800 text-xs">Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
         MODALS
         ═══════════════════════════════════════════════════ */}

      {/* ── Material Modal ── */}
      {showMatModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowMatModal(false)}>
          <div className="bg-white rounded-sm shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">
              {editingMat ? "Editar Material" : "Nuevo Material"}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-field text-sm">Codigo *</label>
                <input className="input-field" value={matForm.code} onChange={(e) => setMatForm({ ...matForm, code: e.target.value })} placeholder="MAT-001" />
              </div>
              <div>
                <label className="label-field text-sm">Nombre *</label>
                <input className="input-field" value={matForm.name} onChange={(e) => setMatForm({ ...matForm, name: e.target.value })} placeholder="Fuente de poder 12V" />
              </div>
              <div className="col-span-2">
                <label className="label-field text-sm">Descripcion</label>
                <textarea className="input-field" rows={2} value={matForm.description} onChange={(e) => setMatForm({ ...matForm, description: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Unidad de Medida</label>
                <select
                  className="input-field"
                  value={matForm.unitOfMeasure}
                  onChange={(e) => { setMatForm((prev) => ({ ...prev, unitOfMeasure: e.target.value })); }}
                >
                  <option value="">— Seleccionar —</option>
                  {uoms.map((u) => (
                    <option key={u.code} value={u.code}>{u.name} ({u.abbreviation})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field text-sm">Costo</label>
                <input className="input-field" type="number" min="0" step="0.01" value={matForm.unitCost} onChange={(e) => setMatForm((prev) => ({ ...prev, unitCost: e.target.value }))} />
              </div>
              <div>
                <label className="label-field text-sm">Por (cant.)</label>
                <input className="input-field" type="number" min="1" step="1" value={matForm.costPerQty} onChange={(e) => setMatForm((prev) => ({ ...prev, costPerQty: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">Precio por esta cantidad (1, 100, 1000...)</p>
              </div>
              <div>
                <label className="label-field text-sm">Lead Time (dias)</label>
                <input className="input-field" type="number" min="0" step="1" value={matForm.leadTimeDays} onChange={(e) => setMatForm({ ...matForm, leadTimeDays: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Stock Seguridad</label>
                <input className="input-field" type="number" min="0" step="1" value={matForm.safetyStockQty} onChange={(e) => setMatForm({ ...matForm, safetyStockQty: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Clasificacion ABC</label>
                <select className="input-field" value={matForm.abcClass} onChange={(e) => setMatForm({ ...matForm, abcClass: e.target.value })}>
                  {ABC_CLASSES.map((c) => <option key={c} value={c}>{c || "— Sin clasificar —"}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="matRecoverable" checked={matForm.isRecoverable} onChange={(e) => setMatForm({ ...matForm, isRecoverable: e.target.checked })} className="rounded-sm" />
                <label htmlFor="matRecoverable" className="text-sm text-gray-700">Recuperable</label>
              </div>
              {matForm.isRecoverable && (
                <div>
                  <label className="label-field text-sm">% Recuperacion</label>
                  <input className="input-field" type="number" min="0" max="100" step="0.01" value={matForm.recoveryYieldPct} onChange={(e) => setMatForm({ ...matForm, recoveryYieldPct: e.target.value })} />
                </div>
              )}
              <div className={matForm.isRecoverable ? "col-span-2" : ""}>
                <label className="label-field text-sm">Proveedor Principal</label>
                <select className="input-field" value={matForm.mainSupplierId} onChange={(e) => setMatForm({ ...matForm, mainSupplierId: e.target.value })}>
                  <option value="">— Ninguno —</option>
                  {suppliers.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className={matForm.isRecoverable ? "col-span-2" : ""}>
                <label className="label-field text-sm">Proveedor Backup</label>
                <select className="input-field" value={matForm.backupSupplierId} onChange={(e) => setMatForm({ ...matForm, backupSupplierId: e.target.value })}>
                  <option value="">— Ninguno —</option>
                  {suppliers.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowMatModal(false)} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button onClick={saveMaterial} disabled={saving || !matForm.code || !matForm.name} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Equipment Modal ── */}
      {showEquipModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEquipModal(false)}>
          <div className="bg-white rounded-sm shadow-xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">
              {editingEquip ? "Editar Equipo" : "Nuevo Equipo"}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-field text-sm">Codigo *</label>
                <input className="input-field" value={equipForm.code} onChange={(e) => setEquipForm({ ...equipForm, code: e.target.value })} placeholder="EQ-001" />
              </div>
              <div>
                <label className="label-field text-sm">Nombre *</label>
                <input className="input-field" value={equipForm.name} onChange={(e) => setEquipForm({ ...equipForm, name: e.target.value })} placeholder="Decodificador HD" />
              </div>
              <div className="col-span-2">
                <label className="label-field text-sm">Descripcion</label>
                <input className="input-field" value={equipForm.description} onChange={(e) => setEquipForm({ ...equipForm, description: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Categoria *</label>
                <select className="input-field" value={equipForm.category} onChange={(e) => setEquipForm({ ...equipForm, category: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label-field text-sm">% Rendimiento Recuperacion</label>
                <input className="input-field" type="number" min="0" max="100" step="0.01" value={equipForm.recoveryYieldPct} onChange={(e) => setEquipForm({ ...equipForm, recoveryYieldPct: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Cant. Base BOM</label>
                <input className="input-field" type="number" min="1" step="1" value={equipForm.bomBaseQty} onChange={(e) => setEquipForm({ ...equipForm, bomBaseQty: e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Cuantas unidades produce 1 set de BOM</p>
              </div>
              <div className="col-span-2">
                <label className="label-field text-sm">Ruta Asignada</label>
                <select className="input-field" value={equipForm.rutaId} onChange={(e) => setEquipForm({ ...equipForm, rutaId: e.target.value })}>
                  <option value="">Sin ruta</option>
                  {rutas.filter((r) => r.isActive).map((r) => (
                    <option key={r.id} value={r.id}>{r.code} - {r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowEquipModal(false)} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button onClick={saveEquipment} disabled={saving || !equipForm.code || !equipForm.name || !equipForm.category} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BOM Item Modal ── */}
      {showBomModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBomModal(false)}>
          <div className="bg-white rounded-sm shadow-xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">
              {editingBomId ? "Editar Línea de BOM" : "Agregar al BOM"}
            </h3>
            <div className="space-y-4">
              {/* Type toggle (only for new items) */}
              {!editingBomId && (
                <div>
                  <label className="label-field text-sm mb-1">Tipo</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setBomForm((p) => ({ ...p, bomType: "material", childEquipmentId: "" }))}
                      className={`px-3 py-1.5 text-sm rounded-sm border ${bomForm.bomType === "material" ? "bg-orange-500 text-white border-orange-500" : "border-gray-300 text-gray-600"}`}>
                      Material
                    </button>
                    <button type="button" onClick={() => setBomForm((p) => ({ ...p, bomType: "subassembly", materialId: "" }))}
                      className={`px-3 py-1.5 text-sm rounded-sm border ${bomForm.bomType === "subassembly" ? "bg-orange-500 text-white border-orange-500" : "border-gray-300 text-gray-600"}`}>
                      Sub-Ensamble (Equipo)
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {bomForm.bomType === "material" ? (
                  <div className="col-span-2">
                    <label className="label-field text-sm">Material *</label>
                    {editingBomId ? (
                      <div className="input-field bg-gray-50 text-gray-600">
                        {materials.find((m) => m.id === bomForm.materialId)?.code} - {materials.find((m) => m.id === bomForm.materialId)?.name}
                      </div>
                    ) : (
                      <select className="input-field" value={bomForm.materialId} onChange={(e) => setBomForm((p) => ({ ...p, materialId: e.target.value }))}>
                        <option value="">Seleccionar...</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>{m.code} - {m.name} ({m.unitOfMeasure})</option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div className="col-span-2">
                    <label className="label-field text-sm">Sub-Ensamble (Equipo) *</label>
                    <select className="input-field" value={bomForm.childEquipmentId} onChange={(e) => setBomForm((p) => ({ ...p, childEquipmentId: e.target.value }))}>
                      <option value="">Seleccionar...</option>
                      {equipment.filter((eq: any) => eq.id !== expandedEquip).map((eq: any) => (
                        <option key={eq.id} value={eq.id}>{eq.code} - {eq.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">La demanda de este equipo se sumará a la demanda del sub-ensamble seleccionado.</p>
                  </div>
                )}
                <div>
                  <label className="label-field text-sm">Cantidad</label>
                  <input className="input-field" type="number" min="0.01" step="0.01" value={bomForm.quantityPerUnit} onChange={(e) => setBomForm((p) => ({ ...p, quantityPerUnit: e.target.value }))} />
                </div>
                <div>
                  <label className="label-field text-sm">Por (equipo)</label>
                  <input className="input-field" type="number" min="1" step="1" value={bomForm.qtyPer} onChange={(e) => setBomForm((p) => ({ ...p, qtyPer: e.target.value }))} />
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowBomModal(false); setEditingBomId(null); }} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button onClick={saveBomItem}
                disabled={saving || (bomForm.bomType === "material" ? !bomForm.materialId : !bomForm.childEquipmentId)}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ruta Modal ── */}
      {showRutaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRutaModal(false)}>
          <div className="bg-white rounded-sm shadow-xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">
              {editingRuta ? "Editar Ruta" : "Nueva Ruta"}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-field text-sm">Codigo *</label>
                <input className="input-field" value={rutaForm.code} onChange={(e) => setRutaForm({ ...rutaForm, code: e.target.value })} placeholder="RUTA-001" />
              </div>
              <div>
                <label className="label-field text-sm">Nombre *</label>
                <input className="input-field" value={rutaForm.name} onChange={(e) => setRutaForm({ ...rutaForm, name: e.target.value })} placeholder="Ruta Decodificador" />
              </div>
              <div className="col-span-2">
                <label className="label-field text-sm">Descripcion</label>
                <input className="input-field" value={rutaForm.description} onChange={(e) => setRutaForm({ ...rutaForm, description: e.target.value })} />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowRutaModal(false)} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button onClick={saveRuta} disabled={saving || !rutaForm.code || !rutaForm.name} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ruta Step Modal ── */}
      {showStepModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowStepModal(false)}>
          <div className="bg-white rounded-sm shadow-xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Agregar Paso a la Ruta</h3>
            <div className="space-y-4">
              {/* Step type toggle */}
              <div>
                <label className="label-field text-sm mb-1">Tipo de Paso *</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStepForm({ ...stepForm, stepType: "subprocess", childRutaId: "" })}
                    className={`px-3 py-1.5 text-sm rounded-sm border transition-colors ${stepForm.stepType === "subprocess" ? "bg-orange-500 text-white border-orange-500" : "border-gray-300 text-gray-600 hover:border-orange-300"}`}
                  >
                    Sub-Proceso
                  </button>
                  <button
                    type="button"
                    onClick={() => setStepForm({ ...stepForm, stepType: "childruta", subProcessId: "" })}
                    className={`px-3 py-1.5 text-sm rounded-sm border transition-colors ${stepForm.stepType === "childruta" ? "bg-orange-500 text-white border-orange-500" : "border-gray-300 text-gray-600 hover:border-orange-300"}`}
                  >
                    Incluir Ruta
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {stepForm.stepType === "subprocess" ? (
                  <>
                    <div className="col-span-2">
                      <label className="label-field text-sm">Sub-Proceso *</label>
                      <select className="input-field" value={stepForm.subProcessId} onChange={(e) => setStepForm({ ...stepForm, subProcessId: e.target.value })}>
                        <option value="">Seleccionar...</option>
                        {subProcesses.filter((p) => p.isActive).map((p) => (
                          <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label-field text-sm">Horas/Unidad</label>
                      <input className="input-field" type="number" min="0" step="0.01" value={stepForm.laborHoursPerUnit} onChange={(e) => setStepForm({ ...stepForm, laborHoursPerUnit: e.target.value })} />
                    </div>
                  </>
                ) : (
                  <div className="col-span-2">
                    <label className="label-field text-sm">Ruta a Incluir *</label>
                    <select className="input-field" value={stepForm.childRutaId} onChange={(e) => setStepForm({ ...stepForm, childRutaId: e.target.value })}>
                      <option value="">Seleccionar...</option>
                      {rutas.filter((r) => r.isActive && r.id !== expandedRuta).map((r) => (
                        <option key={r.id} value={r.id}>{r.code} - {r.name} ({r._count?.steps ?? 0} pasos)</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Todos los pasos de la ruta seleccionada se heredaran automaticamente.</p>
                  </div>
                )}
                <div>
                  <label className="label-field text-sm">Secuencia</label>
                  <input className="input-field" type="number" min="1" step="1" value={stepForm.sequenceOrder} onChange={(e) => setStepForm({ ...stepForm, sequenceOrder: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="stepParallel" checked={stepForm.isParallel} onChange={(e) => setStepForm({ ...stepForm, isParallel: e.target.checked })} className="rounded-sm" />
                <label htmlFor="stepParallel" className="text-sm text-gray-700">Puede ejecutarse en paralelo</label>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowStepModal(false)} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button
                onClick={saveRutaStep}
                disabled={saving || (stepForm.stepType === "subprocess" ? !stepForm.subProcessId : !stepForm.childRutaId)}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Supplier Modal ── */}
      {showSuppModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSuppModal(false)}>
          <div className="bg-white rounded-sm shadow-xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">
              {editingSupp ? "Editar Proveedor" : "Nuevo Proveedor"}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-field text-sm">Nombre *</label>
                <input className="input-field" value={suppForm.name} onChange={(e) => setSuppForm({ ...suppForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Contacto</label>
                <input className="input-field" value={suppForm.contactName} onChange={(e) => setSuppForm({ ...suppForm, contactName: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Email</label>
                <input className="input-field" type="email" value={suppForm.email} onChange={(e) => setSuppForm({ ...suppForm, email: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Telefono</label>
                <input className="input-field" value={suppForm.phone} onChange={(e) => setSuppForm({ ...suppForm, phone: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Pais</label>
                <input className="input-field" value={suppForm.country} onChange={(e) => setSuppForm({ ...suppForm, country: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Moneda</label>
                <select className="input-field" value={suppForm.currency} onChange={(e) => setSuppForm({ ...suppForm, currency: e.target.value })}>
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                  <option value="COP">COP</option>
                  <option value="BRL">BRL</option>
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowSuppModal(false)} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button onClick={saveSupplier} disabled={saving || !suppForm.name} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Supplier Item Modal ── */}
      {showSuppItemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSuppItemModal(false)}>
          <div className="bg-white rounded-sm shadow-xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Agregar Item de Proveedor</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label-field text-sm">Material *</label>
                <select className="input-field" value={suppItemForm.materialId} onChange={(e) => setSuppItemForm({ ...suppItemForm, materialId: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.code} - {m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field text-sm">UdM</label>
                <select className="input-field" value={suppItemForm.unitOfMeasure} onChange={(e) => setSuppItemForm({ ...suppItemForm, unitOfMeasure: e.target.value })}>
                  {uoms.map((u) => (
                    <option key={u.code} value={u.code}>{u.name} ({u.abbreviation})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field text-sm">Unidad Compra</label>
                <input className="input-field" value={suppItemForm.purchaseUnit} onChange={(e) => setSuppItemForm({ ...suppItemForm, purchaseUnit: e.target.value })} placeholder="Caja" />
              </div>
              <div>
                <label className="label-field text-sm">Cant. Unidad Compra</label>
                <input className="input-field" type="number" min="1" step="1" value={suppItemForm.purchaseUnitQty} onChange={(e) => setSuppItemForm({ ...suppItemForm, purchaseUnitQty: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Costo Unitario</label>
                <input className="input-field" type="number" min="0" step="0.01" value={suppItemForm.unitCost} onChange={(e) => setSuppItemForm({ ...suppItemForm, unitCost: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">MOQ</label>
                <input className="input-field" type="number" min="1" step="1" value={suppItemForm.moq} onChange={(e) => setSuppItemForm({ ...suppItemForm, moq: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="isPreferred" checked={suppItemForm.isPreferred} onChange={(e) => setSuppItemForm({ ...suppItemForm, isPreferred: e.target.checked })} className="rounded-sm" />
                <label htmlFor="isPreferred" className="text-sm text-gray-700">Preferido</label>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowSuppItemModal(false)} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button onClick={saveSupplierItem} disabled={saving || !suppItemForm.materialId} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-Process Modal ── */}
      {showProcModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowProcModal(false)}>
          <div className="bg-white rounded-sm shadow-xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">
              {editingProc ? "Editar Sub-Proceso" : "Nuevo Sub-Proceso"}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-field text-sm">Codigo *</label>
                <input className="input-field" value={procForm.code} onChange={(e) => setProcForm({ ...procForm, code: e.target.value })} placeholder="PROC-010" />
              </div>
              <div>
                <label className="label-field text-sm">Nombre *</label>
                <input className="input-field" value={procForm.name} onChange={(e) => setProcForm({ ...procForm, name: e.target.value })} placeholder="Diagnostico visual" />
              </div>
              <div className="col-span-2">
                <label className="label-field text-sm">Descripcion</label>
                <input className="input-field" value={procForm.description} onChange={(e) => setProcForm({ ...procForm, description: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Secuencia Default</label>
                <input className="input-field" type="number" min="1" step="1" value={procForm.defaultSequence} onChange={(e) => setProcForm({ ...procForm, defaultSequence: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Capacidad/Hora</label>
                <input className="input-field" type="number" min="0" step="0.01" value={procForm.capacityPerHour} onChange={(e) => setProcForm({ ...procForm, capacityPerHour: e.target.value })} />
              </div>
              <div>
                <label className="label-field text-sm">Estaciones</label>
                <input className="input-field" type="number" min="1" step="1" value={procForm.stationCount} onChange={(e) => setProcForm({ ...procForm, stationCount: e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Puestos de trabajo disponibles</p>
              </div>
              <div>
                <label className="label-field text-sm">Personal/Estacion</label>
                <input className="input-field" type="number" min="1" step="1" value={procForm.personnelPerStation} onChange={(e) => setProcForm({ ...procForm, personnelPerStation: e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Personas por puesto</p>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="requiresSpecialist" checked={procForm.requiresSpecialist} onChange={(e) => setProcForm({ ...procForm, requiresSpecialist: e.target.checked })} className="rounded-sm" />
                <label htmlFor="requiresSpecialist" className="text-sm text-gray-700">Requiere Especialista</label>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="procActive" checked={procForm.isActive} onChange={(e) => setProcForm({ ...procForm, isActive: e.target.checked })} className="rounded-sm" />
                <label htmlFor="procActive" className="text-sm text-gray-700">Activo</label>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowProcModal(false)} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
              <button onClick={saveSubProcess} disabled={saving || !procForm.code || !procForm.name} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
