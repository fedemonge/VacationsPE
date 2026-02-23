"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

interface Config {
  id: string;
  key: string;
  value: string;
  description: string;
}

interface UserEntry {
  email: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: "Administrador",
  SUPERVISOR: "Supervisor",
  GERENTE_PAIS: "Gerente País",
  RRHH: "Recursos Humanos",
};

export default function ConfiguracionPage() {
  const { role: currentRole } = useAuth();
  const isAdmin = currentRole === "ADMINISTRADOR";

  // System config state
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  // User management state
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("SUPERVISOR");
  const [userMessage, setUserMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  // --- System Configuration ---
  async function loadConfigs() {
    setLoading(true);
    try {
      const res = await fetch("/api/configuracion");
      const data = await res.json();
      // Filter out user-specific entries from config table
      const filtered = (data.configs || []).filter(
        (c: Config) =>
          !c.key.startsWith("USER_ROLE_") &&
          !c.key.startsWith("USER_PASSWORD_") &&
          !c.key.startsWith("USER_MUST_CHANGE_PWD_") &&
          !c.key.startsWith("USER_RESET_TOKEN_")
      );
      setConfigs(filtered);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(key: string) {
    try {
      const res = await fetch("/api/configuracion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: editValue }),
      });

      if (res.ok) {
        setSuccess(`Configuración "${key}" actualizada.`);
        setEditingKey(null);
        loadConfigs();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      // ignore
    }
  }

  // --- User Management ---
  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/usuarios");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      // ignore
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleAssignRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || !newRole) return;

    setSavingUser(true);
    setUserMessage(null);

    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), role: newRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        setUserMessage({ type: "error", text: data.error });
      } else {
        setUserMessage({ type: "success", text: data.message });
        setNewEmail("");
        loadUsers();
      }
    } catch {
      setUserMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setSavingUser(false);
    }
  }

  async function handleRemoveRole(email: string) {
    if (
      !confirm(
        `¿Está seguro de eliminar el rol de ${email}? El usuario solo tendrá acceso básico.`
      )
    )
      return;

    try {
      const res = await fetch(
        `/api/usuarios?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );

      const data = await res.json();

      if (!res.ok) {
        setUserMessage({ type: "error", text: data.error });
      } else {
        setUserMessage({ type: "success", text: data.message });
        loadUsers();
      }
    } catch {
      setUserMessage({ type: "error", text: "Error de conexión" });
    }
  }

  async function handleResetPassword(email: string) {
    if (
      !confirm(
        `¿Está seguro de restablecer la contraseña de ${email}? La nueva contraseña será Woden123 y deberá cambiarla al iniciar sesión.`
      )
    )
      return;

    setResettingPassword(email);
    try {
      const res = await fetch("/api/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setUserMessage({ type: "error", text: data.error });
      } else {
        setUserMessage({ type: "success", text: data.message });
      }
    } catch {
      setUserMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setResettingPassword(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Configuración del Sistema
      </h1>
      <p className="text-gray-500 mb-6 text-sm">
        Parámetros configurables del sistema y gestión de usuarios.
      </p>

      {/* ===== User Role Management (Admin only) ===== */}
      {isAdmin && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Gestión de Usuarios y Roles
          </h2>

          {userMessage && (
            <div
              className={`mb-4 p-3 rounded-sm text-sm ${
                userMessage.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}
            >
              {userMessage.text}
            </div>
          )}

          {/* Assign Role Form */}
          <form
            onSubmit={handleAssignRole}
            className="card border-l-4 border-l-woden-primary mb-4"
          >
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Asignar Rol a Usuario
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input
                  type="email"
                  className="input-field"
                  placeholder="correo@empresa.com.pe"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div className="sm:w-48">
                <select
                  className="input-field"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="RRHH">Recursos Humanos</option>
                  <option value="GERENTE_PAIS">Gerente País</option>
                  <option value="ADMINISTRADOR">Administrador</option>
                </select>
              </div>
              <button
                type="submit"
                className="btn-primary whitespace-nowrap"
                disabled={savingUser || !newEmail.trim()}
              >
                {savingUser ? "Asignando..." : "Asignar Rol"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              La contraseña inicial del usuario será <span className="font-mono font-medium">Woden123</span>.
              Si el usuario ya existe, solo se actualizará su rol.
            </p>
          </form>

          {/* Users Table */}
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Correo Electrónico</th>
                  <th className="table-header">Rol</th>
                  <th className="table-header w-48">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="table-cell text-center text-gray-400"
                    >
                      Cargando...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="table-cell text-center text-gray-400"
                    >
                      No hay usuarios con rol asignado
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.email}
                      className="hover:bg-woden-primary-lighter"
                    >
                      <td className="table-cell text-sm">{user.email}</td>
                      <td className="table-cell">
                        <span className="text-xs px-2 py-0.5 rounded bg-woden-primary-light text-woden-primary font-medium">
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex gap-2">
                          <button
                            className="text-xs text-woden-primary hover:underline"
                            onClick={() => handleResetPassword(user.email)}
                            disabled={resettingPassword === user.email}
                          >
                            {resettingPassword === user.email
                              ? "Restableciendo..."
                              : "Restablecer Clave"}
                          </button>
                          <button
                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                            onClick={() => handleRemoveRole(user.email)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== System Configuration Table ===== */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">
        Parámetros del Sistema
      </h2>

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-sm text-green-800 text-sm">
          {success}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Clave</th>
              <th className="table-header">Valor</th>
              <th className="table-header">Descripción</th>
              <th className="table-header w-24">Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  className="table-cell text-center text-gray-400"
                >
                  Cargando...
                </td>
              </tr>
            ) : (
              configs.map((config) => (
                <tr
                  key={config.key}
                  className="hover:bg-woden-primary-lighter"
                >
                  <td className="table-cell font-mono text-xs text-woden-primary">
                    {config.key}
                  </td>
                  <td className="table-cell">
                    {editingKey === config.key ? (
                      <input
                        type="text"
                        className="input-field text-sm"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm">{config.value}</span>
                    )}
                  </td>
                  <td className="table-cell text-xs text-gray-400">
                    {config.description}
                  </td>
                  <td className="table-cell">
                    {editingKey === config.key ? (
                      <div className="flex gap-1">
                        <button
                          className="text-xs text-green-600 hover:underline"
                          onClick={() => handleSave(config.key)}
                        >
                          Guardar
                        </button>
                        <button
                          className="text-xs text-gray-400 hover:underline"
                          onClick={() => setEditingKey(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        className="text-xs text-woden-primary hover:underline"
                        onClick={() => {
                          setEditingKey(config.key);
                          setEditValue(config.value);
                        }}
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
