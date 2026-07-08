"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Shield, ShieldCheck } from "lucide-react";
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

interface MatrixResponse {
  members: MatrixMember[];
  modules: MatrixModule[];
  assignments: MatrixAssignment[];
  roles: string[];
  rolePermissions: Record<string, string[]>;
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

  const scopedMembers = data?.members.filter((m) => !["supervisor", "admin"].includes(m.rbacRole)) || [];
  const unscopedMembers = data?.members.filter((m) => ["supervisor", "admin"].includes(m.rbacRole)) || [];

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
                Supervisors and admins see all modules, conversations, and tickets without assignments.
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
              <h2 className="font-semibold text-owly-text">What each role can do</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-owly-border text-left text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                      <th className="py-2 pr-4">Permission</th>
                      {data.roles.map((role) => (
                        <th key={role} className="px-3 py-2 text-center capitalize">{role}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-owly-border">
                    {Object.entries(data.rolePermissions).map(([permission, roles]) => (
                      <tr key={permission}>
                        <td className="py-2 pr-4 font-mono text-xs text-owly-text">{permission}</td>
                        {data.roles.map((role) => (
                          <td key={role} className="px-3 py-2 text-center">
                            {roles.includes(role) ? (
                              <span className="text-green-600">✓</span>
                            ) : (
                              <span className="text-owly-text-light/40">-</span>
                            )}
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
    </div>
  );
}
