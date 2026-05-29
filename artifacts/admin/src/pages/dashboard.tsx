import { useState } from "react";
import { useListTeachers, useCreateTeacher, useToggleTeacherStatus } from "@workspace/api-client-react";
import type { Teacher } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, Users, Plus, LogOut, ToggleLeft, ToggleRight,
  Copy, Check, AlertCircle, X, Mail, Phone, CheckCircle, XCircle,
  ExternalLink, RefreshCw, Trash2, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DashboardPage() {
  const { user, logout, token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useListTeachers();
  const createMutation = useCreateTeacher();
  const toggleMutation = useToggleTeacherStatus();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", mobile: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [newTeacher, setNewTeacher] = useState<{ teacher: Teacher; tempPassword: string } | null>(null);
  const [copiedPwd, setCopiedPwd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const teachers = data?.teachers ?? [];
  const activeCount = teachers.filter((t) => t.isActive).length;
  const masterSheetUrl = (data as any)?.masterSheetUrl ?? null;

  function validateForm() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Required";
    if (!form.email.includes("@")) errs.email = "Invalid email";
    if (!/^\d{10}$/.test(form.mobile)) errs.mobile = "Must be 10 digits";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      const result = await createMutation.mutateAsync({ data: form });
      setNewTeacher(result);
      setForm({ name: "", email: "", mobile: "" });
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["listTeachers"] });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error ?? "Failed to create teacher",
        variant: "destructive",
      });
    }
  }

  async function handleToggle(teacher: Teacher) {
    try {
      await toggleMutation.mutateAsync({ id: teacher.id, data: { isActive: !teacher.isActive } });
      qc.invalidateQueries({ queryKey: ["listTeachers"] });
      toast({
        title: teacher.isActive ? "Teacher deactivated" : "Teacher activated",
        description: `${teacher.name} has been ${teacher.isActive ? "deactivated" : "activated"}.`,
      });
    } catch {
      toast({ title: "Error", description: "Failed to update teacher status", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/teachers/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Delete failed" }));
        toast({ title: "Cannot delete", description: body.error ?? "Delete failed", variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["listTeachers"] });
      toast({ title: "Teacher deleted", description: `${deleteTarget.name} has been removed.` });
      setDeleteTarget(null);
    } catch {
      toast({ title: "Error", description: "Network error — could not delete teacher.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  }

  function copyPassword() {
    if (newTeacher?.tempPassword) {
      navigator.clipboard.writeText(newTeacher.tempPassword);
      setCopiedPwd(true);
      setTimeout(() => setCopiedPwd(false), 2000);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Student Data System</h1>
              <p className="text-xs text-gray-500">Super Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:block">{user?.name}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Master Sheet banner */}
        {masterSheetUrl && (
          <div className="flex items-center justify-between gap-4 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <ExternalLink className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-900">Master Google Sheet</p>
                <p className="text-xs text-green-700">All teachers have their own tab — one sheet for everything</p>
              </div>
            </div>
            <a
              href={masterSheetUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Sheet
            </a>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={<Users className="w-5 h-5 text-blue-600" />} label="Total Teachers" value={teachers.length} bg="bg-blue-50" />
          <StatCard icon={<CheckCircle className="w-5 h-5 text-green-600" />} label="Active" value={activeCount} bg="bg-green-50" />
          <StatCard icon={<XCircle className="w-5 h-5 text-red-500" />} label="Inactive" value={teachers.length - activeCount} bg="bg-red-50" />
        </div>

        {/* Teacher list */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Teachers</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Teacher
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-gray-600">Failed to load teachers</p>
              <button onClick={() => refetch()} className="text-sm text-blue-600 hover:underline">Retry</button>
            </div>
          ) : teachers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
              <Users className="w-10 h-10 text-gray-300" />
              <p className="font-medium text-gray-700">No teachers yet</p>
              <p className="text-sm text-gray-500">Add your first teacher to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {teachers.map((teacher) => (
                <TeacherRow
                  key={teacher.id}
                  teacher={teacher}
                  onToggle={() => handleToggle(teacher)}
                  onDelete={() => setDeleteTarget(teacher)}
                  isToggling={toggleMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create teacher modal */}
      {showCreate && (
        <Modal title="Add Teacher" onClose={() => { setShowCreate(false); setForm({ name: "", email: "", mobile: "" }); setFormErrors({}); }}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Full Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Priya Sharma"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="teacher@school.com"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Mobile (10 digits)</label>
              <input
                value={form.mobile}
                onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                placeholder="9876543210"
                maxLength={10}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {formErrors.mobile && <p className="text-xs text-red-500 mt-1">{formErrors.mobile}</p>}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setForm({ name: "", email: "", mobile: "" }); setFormErrors({}); }}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {createMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : "Create Teacher"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* New teacher created — show temp password */}
      {newTeacher && (
        <Modal title="Teacher Created!" onClose={() => { setNewTeacher(null); setCopiedPwd(false); }}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
              <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-gray-900">{newTeacher.teacher.name}</p>
                <p className="text-sm text-gray-500">{newTeacher.teacher.email}</p>
                {newTeacher.teacher.googleSheetUrl && (
                  <p className="text-xs text-green-600 mt-0.5">Google Sheet tab created</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Temporary Password (share with teacher)</p>
              <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-xl border border-gray-200">
                <code className="flex-1 text-base font-mono font-bold text-gray-900 tracking-widest">
                  {newTeacher.tempPassword}
                </code>
                <button
                  onClick={copyPassword}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors text-gray-600"
                >
                  {copiedPwd ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-amber-600 mt-2">
                ⚠ This password won't be shown again. The teacher will be prompted to change it on first login.
              </p>
            </div>

            <button
              onClick={() => { setNewTeacher(null); setCopiedPwd(false); }}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <Modal title="Delete Teacher" onClose={() => !isDeleting && setDeleteTarget(null)}>
          <div className="space-y-5">
            <div className="flex items-start gap-4 p-4 bg-red-50 rounded-xl border border-red-100">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Delete {deleteTarget.name}?</p>
                <p className="text-sm text-gray-600 mt-1">
                  This will permanently remove their account. Their Google Sheet tab will remain.
                </p>
                {(deleteTarget.studentCount ?? 0) > 0 && (
                  <p className="text-sm text-red-600 font-medium mt-2">
                    This teacher has {deleteTarget.studentCount} student record{(deleteTarget.studentCount ?? 0) > 1 ? "s" : ""}.
                    You must delete all their students first.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting || (deleteTarget.studentCount ?? 0) > 0}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Trash2 className="w-4 h-4" />Delete Teacher</>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TeacherRow({ teacher, onToggle, onDelete, isToggling }: {
  teacher: Teacher; onToggle: () => void; onDelete: () => void; isToggling: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
        <span className="text-blue-600 font-bold text-sm">
          {teacher.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 text-sm">{teacher.name}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${teacher.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {teacher.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Mail className="w-3 h-3" />{teacher.email}
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Phone className="w-3 h-3" />{teacher.mobile}
          </span>
          <span className="text-xs text-gray-400">{teacher.studentCount ?? 0} students</span>
          {teacher.googleSheetUrl && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle className="w-3 h-3" /> Sheet ready
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onToggle}
          disabled={isToggling}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            teacher.isActive
              ? "text-orange-600 hover:bg-orange-50"
              : "text-green-600 hover:bg-green-50"
          } disabled:opacity-50`}
        >
          {teacher.isActive ? (
            <><ToggleRight className="w-4 h-4" />Deactivate</>
          ) : (
            <><ToggleLeft className="w-4 h-4" />Activate</>
          )}
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete teacher"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: number; bg: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 shadow-sm">
      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
