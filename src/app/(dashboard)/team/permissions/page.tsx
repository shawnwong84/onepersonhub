"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Shield, ShieldCheck, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MatrixMember {
  id: string;
  name: string;
  username: string | null;
  rbacRole: string;
  isActive: boolean;
  department: { name: string } | null;
}

interface MatrixModule {
  slug: string;
  name: string;
  isCore: boolean;
}

interface MatrixAssignment {
  teamMemberId: string;
  moduleSlug: string;
  access: string;
}

interface RoleData {
  id: string;
  name: string;
  label: string;
  isBuiltIn: boolean;
  isUnscoped: boolean;
  permissions: string[];
}

interface MatrixResponse {
  members: MatrixMember[];
  modules: MatrixModule[];
  assignments: MatrixAssignment[];
  roles: RoleData[];
  allPermissions: string[];
}

type AccessLevel = "none" | "read" | "write";

const NEXT_LEVEL: Record<AccessLevel, AccessLevel> = {
  none: "read",
  read: "write",
  write: "none",
};

export default function PermissionMatrixPage() {
  const [data, setData] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", label: "", isUnscoped: false });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/team/permissions");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || body?.error || "Failed to load matrix");
      setData(body as MatrixResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matrix");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function accessFor(memberId: string, slug: string): AccessLevel {
    const assignment = data?.assignments.find(
      (a) => a.teamMemberId === memberId && a.moduleSlug === slug
    );
    return (assignment?.access as AccessLevel) || "none";
  }

  async function cycleAccess(member: MatrixMember, module: MatrixModule) {
    const current = accessFor(member.id, module.slug);
    const next = NEXT_LEVEL[current];
    const key = `${member.id}:${module.slug}`;
    setPending(key);
    setError("");
    try {
      const res =
        next === "none"
          ? await fetch(
              `/api/team/members/${member.id}/modules?moduleSlug=${encodeURIComponent(module.slug)}`,
              { method: "DELETE" }
            )
          : await fetch(`/api/team/members/${member.id}/modules`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ moduleSlug: module.slug, access: next }),
            });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || body?.error || "Failed to update assignment");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update assignment");
    } finally {
      setPending(null);
    }
  }

  async function togglePermission(role: RoleData, permission: string) {
    const hasIt = role.permissions.includes(permission);
    const nextPermissions = hasIt
      ? role.permissions.filter((p) => p !== permission)
      : [...role.permissions, permission];
    setSavingRoleId(role.id);
    setError("");
    try {
      const res = await fetch(`/api/team/permissions/roles/${role.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: nextPermissions }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || body?.error || "Failed to update role");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSavingRoleId(null);
    }
  }

  async function toggleUnscoped(role: RoleData) {
    setSavingRoleId(role.id);
    setError("");
    try {
      const res = await fetch(`/api/team/permissions/roles/${role.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isUnscoped: !role.isUnscoped }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || body?.error || "Failed to update role");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSavingRoleId(null);
    }
  }

  async function deleteRole(role: RoleData) {
    if (!confirm(`Delete the "${role.label}" role? This can't be undone.`)) return;
    setSavingRoleId(role.id);
    setError("");
    try {
      const res = await fetch(`/api/team/permissions/roles/${role.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || body?.error || "Failed to delete role");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role");
    } finally {
      setSavingRoleId(null);
    }
  }

  async function createRole() {
    if (!createForm.name.trim() || !createForm.label.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/team/permissions/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...createForm, permissions: [] }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || body?.error || "Failed to create role");
      }
      setShowCreateModal(false);
      setCreateForm({ name: "", label: "", isUnscoped: false });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setCreating(false);
    }
  }

  const unscopedRoleNames = useMemo(
    () => new Set((data?.roles || []).filter((r) => r.isUnscoped).map((r) => r.name)),
    [data]
  );
  const scopedMembers = data?.members.filter((m) => !unscopedRoleNames.has(m.rbacRole)) || [];
  const unscopedMembers = data?.members.filter((m) => unscopedRoleNames.has(m.rbacRole)) || [];

  return (
    <div className="h-full overflow-y-auto bg-owly-bg">
      <div className="mx-auto max-w-[1400px] space-y-5 p-5">
        <div className="rounded-xl border border-owly-border bg-owly-surface p-5">
          <Link href="/team" className="inline-flex items-center gap-2 text-sm font-semibold text-owly-primary">
            <ArrowLeft className="h-4 w-4" />
            Team
          </Link>
          <div className="mt-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-owly-primary" />
            <h1 className="text-2xl font-bold text-owly-text">Permission matrix</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-owly-text-light">
            Click a cell to cycle access: none, read, write. Agents and viewers only see assigned modules,
            conversations, and tickets. Supervisors and admins see everything. Core modules are readable by everyone.
          </p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="rounded-xl border border-owly-border bg-owly-surface p-10 text-center text-sm text-owly-text-light">
            Loading permission matrix...
          </div>
        ) : data ? (
          <>
            <section className="rounded-xl border border-owly-border bg-owly-surface">
              <div className="border-b border-owly-border px-5 py-4">
                <h2 className="font-semibold text-owly-text">Module assignments</h2>
                <p className="text-sm text-owly-text-light">
                  Members with agent or viewer roles. Login must be issued from the Team page.
                </p>
              </div>
              {scopedMembers.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-owly-text-light">
                  No agent or viewer members yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-owly-border text-left text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                        <th className="px-5 py-3">Member</th>
                        {data.modules.map((module) => (
                          <th key={module.slug} className="px-3 py-3 text-center">
                            {module.name}
                            {module.isCore && (
                              <span className="ml-1 rounded bg-owly-primary-50 px-1 text-[10px] font-semibold text-owly-primary">CORE</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-owly-border">
                      {scopedMembers.map((member) => (
                        <tr key={member.id}>
                          <td className="whitespace-nowrap px-5 py-3">
                            <p className="font-semibold text-owly-text">{member.name}</p>
                            <p className="text-xs text-owly-text-light">
                              {member.rbacRole}
                              {member.username ? ` - ${member.username}` : " - no login"}
                              {!member.isActive && " - disabled"}
                            </p>
                          </td>
                          {data.modules.map((module) => {
                            const level = accessFor(member.id, module.slug);
                            const key = `${member.id}:${module.slug}`;
                            return (
                              <td key={module.slug} className="px-3 py-3 text-center">
                                <button
                                  type="button"
                                  disabled={pending === key}
                                  onClick={() => cycleAccess(member, module)}
                                  className={cn(
                                    "inline-flex min-w-[64px] items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                                    level === "write"
                                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                                      : level === "read"
                                      ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                      : module.isCore
                                      ? "bg-owly-primary-50 text-owly-primary"
                                      : "bg-owly-bg text-owly-text-light hover:bg-owly-primary-50"
                                  )}
                                  title={module.isCore && level === "none" ? "Core module: read access for everyone. Click to grant write." : "Click to cycle: none, read, write"}
                                >
                                  {pending === key ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : level === "none" && module.isCore ? (
                                    "core read"
                                  ) : (
                                    level
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-owly-border bg-owly-surface p-5">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-owly-primary" />
                <h2 className="font-semibold text-owly-text">Full-access members</h2>
              </div>
              <p className="mt-1 text-sm text-owly-text-light">
                Roles marked &ldquo;unscoped&rdquo; below see all modules, conversations, and tickets without assignments.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {unscopedMembers.length === 0 ? (
                  <span className="text-sm text-owly-text-light">None.</span>
                ) : (
                  unscopedMembers.map((member) => (
                    <span key={member.id} className="rounded-lg bg-owly-bg px-3 py-1.5 text-sm text-owly-text">
                      {member.name} <span className="text-xs text-owly-text-light">({member.rbacRole})</span>
                    </span>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-owly-border bg-owly-surface p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-owly-text">Roles and permissions</h2>
                  <p className="mt-0.5 text-sm text-owly-text-light">
                    Click a checkmark to grant or revoke a permission. Built-in roles can be edited but not
                    deleted; custom roles can be both, as long as no member currently holds them.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-owly-primary px-3 py-2 text-sm font-medium text-white hover:bg-owly-primary-dark transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  New role
                </button>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-owly-border text-left text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                      <th className="py-2 pr-4">Permission</th>
                      {data.roles.map((role) => (
                        <th key={role.id} className="px-3 py-2 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span>{role.label}</span>
                            {!role.isBuiltIn && (
                              <button
                                onClick={() => deleteRole(role)}
                                disabled={savingRoleId === role.id}
                                title="Delete role"
                                className="text-owly-text-light hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-owly-border">
                      <td className="py-2 pr-4 text-xs font-medium text-owly-text-light">Unscoped (sees all data)</td>
                      {data.roles.map((role) => (
                        <td key={role.id} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={role.isUnscoped}
                            disabled={savingRoleId === role.id}
                            onChange={() => toggleUnscoped(role)}
                            className="accent-owly-primary"
                          />
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-owly-border">
                    {data.allPermissions.map((permission) => (
                      <tr key={permission}>
                        <td className="py-2 pr-4 font-mono text-xs text-owly-text">{permission}</td>
                        {data.roles.map((role) => (
                          <td key={role.id} className="px-3 py-2 text-center">
                            <button
                              onClick={() => togglePermission(role, permission)}
                              disabled={savingRoleId === role.id}
                              className={cn(
                                "inline-flex h-5 w-5 items-center justify-center rounded transition-colors",
                                role.permissions.includes(permission)
                                  ? "text-green-600 hover:bg-green-50"
                                  : "text-owly-text-light/40 hover:bg-owly-bg"
                              )}
                            >
                              {role.permissions.includes(permission) ? "✓" : "-"}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowCreateModal(false)} />
          <div className="relative w-full max-w-md mx-4 bg-owly-surface rounded-xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-owly-border">
              <h3 className="font-semibold text-owly-text text-lg">New role</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 hover:bg-owly-primary-50 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-owly-text-light" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-owly-text mb-1">Display label</label>
                <input
                  type="text"
                  value={createForm.label}
                  onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
                  placeholder="e.g. Billing Specialist"
                  className="w-full text-sm px-3 py-2 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-owly-text mb-1">Role name (used internally)</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. billing-specialist"
                  className="w-full text-sm px-3 py-2 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30"
                />
                <p className="mt-1 text-xs text-owly-text-light">Lowercase letters, numbers, and hyphens only.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-owly-text">
                <input
                  type="checkbox"
                  checked={createForm.isUnscoped}
                  onChange={(e) => setCreateForm({ ...createForm, isUnscoped: e.target.checked })}
                  className="accent-owly-primary"
                />
                Unscoped - sees all conversations/tickets, not just assigned ones
              </label>
              <p className="text-xs text-owly-text-light">
                Permissions start empty and can be granted from the matrix below after creating the role.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-owly-border">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-owly-text hover:bg-owly-primary-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createRole}
                disabled={!createForm.name.trim() || !createForm.label.trim() || creating}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  createForm.name.trim() && createForm.label.trim() && !creating
                    ? "bg-owly-primary text-white hover:bg-owly-primary-dark"
                    : "bg-owly-border text-owly-text-light cursor-not-allowed"
                )}
              >
                {creating ? "Creating..." : "Create role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
