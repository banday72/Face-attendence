"use client";

import { KeyRound, Plus, RefreshCw, Search, Upload } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { BulkImportDialog, BulkImportHistory } from "@/components/admin/bulk-import-dialog";
import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { RowActions } from "@/components/common/row-actions";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useDebouncedValue, useResource } from "@/lib/hooks";
import { normalizeDepartment, normalizePaginated, normalizeUser } from "@/lib/normalize";
import type { Department, Role, User } from "@/lib/types";
import { initials } from "@/lib/utils";

interface UserForm {
  full_name: string;
  email: string;
  phone: string;
  university_id: string;
  employee_id: string;
  role: Role;
  department_id: string;
  password: string;
  is_active: boolean;
  program: string;
  year_level: string;
  title: string;
  office: string;
}

function emptyForm(role: Role = "student"): UserForm {
  return {
    full_name: "",
    email: "",
    phone: "",
    university_id: "",
    employee_id: "",
    role,
    department_id: "",
    password: "",
    is_active: true,
    program: "",
    year_level: "",
    title: "",
    office: "",
  };
}

const roleVariant: Record<Role, "purple" | "info" | "warning"> = {
  student: "purple",
  professor: "info",
  admin: "warning",
};

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const debouncedSearch = useDebouncedValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  useEffect(() => {
    const querySearch = new URLSearchParams(window.location.search).get("search");
    if (querySearch) {
      setSearch(querySearch);
      setPage(1);
    }
  }, []);

  const loader = useCallback(
    () =>
      api.getPaginated<User>("/admin/users", normalizeUser, {
        query: {
          page,
          page_size: 20,
          search: debouncedSearch || undefined,
          role: roleFilter || undefined,
        },
      }),
    [debouncedSearch, page, roleFilter],
  );
  const resource = useResource(loader);
  const departmentsLoader = useCallback(
    () => api.get<unknown>("/departments").then((payload) => normalizePaginated(payload, normalizeDepartment).items),
    [],
  );
  const departments = useResource<Department[]>(departmentsLoader);

  const openCreate = (role: Role = "student") => {
    setEditing(null);
    setForm(emptyForm(role));
    setFormError(null);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setForm({
      full_name: user.full_name,
      email: user.email,
      phone: user.phone ?? "",
      university_id: user.university_id ?? "",
      employee_id: user.employee_id ?? "",
      role: user.role,
      department_id: user.department_id ?? "",
      password: "",
      is_active: user.is_active,
      program: user.program ?? "",
      year_level: user.year_level ? String(user.year_level) : "",
      title: user.title ?? "",
      office: user.office ?? "",
    });
    setFormError(null);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.full_name.trim()) nextErrors.full_name = "Full name is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = "Enter a valid email.";
    if (!editing) {
      if (form.password.length < 8) nextErrors.password = "Use at least 8 characters.";
      if (form.role === "student" && !form.university_id.trim()) {
        nextErrors.university_id = "University ID is required for students.";
      }
      if (form.role === "professor" && !form.employee_id.trim()) {
        nextErrors.employee_id = "Employee ID is required for professors.";
      }
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        department_id: form.department_id || null,
        phone: form.phone.trim() || null,
      };
      if (editing) {
        payload.is_active = form.is_active;
      } else {
        payload.role = form.role;
        payload.password = form.password;
      }
      if (form.role === "student") {
        if (form.university_id.trim()) payload.university_id = form.university_id.trim();
        if (form.program.trim()) payload.program = form.program.trim();
        if (form.year_level) payload.year_level = Number(form.year_level);
      }
      if (form.role === "professor") {
        if (form.employee_id.trim()) payload.employee_id = form.employee_id.trim();
        if (form.title.trim()) payload.title = form.title.trim();
        if (form.office.trim()) payload.office = form.office.trim();
      }

      if (editing) {
        await api.patch(`/admin/users/${editing.id}`, payload);
        toast.success("User updated");
      } else {
        await api.post("/admin/users", payload);
        toast.success(form.role === "professor" ? "Professor account created" : "Student account created");
      }
      setDialogOpen(false);
      resource.reload();
    } catch (error) {
      setFormError(errorMessage(error));
      if (error instanceof ApiError) setFieldErrors(error.fields);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/users/${deleting.id}`);
      toast.success("User deleted");
      setDeleting(null);
      resource.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetting) return;
    if (resetPassword.length < 8) {
      setResetError("Use at least 8 characters.");
      return;
    }
    setResetLoading(true);
    setResetError(null);
    try {
      await api.post(`/admin/users/${resetting.id}/reset-password`, { password: resetPassword });
      toast.success("Password reset and sessions revoked");
      setResetting(null);
      setResetPassword("");
      resource.reload();
    } catch (error) {
      setResetError(errorMessage(error));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management"
        title="Users"
        description="Create students and professors, manage profiles, and reset passwords."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload /> Bulk import
            </Button>
            <Button variant="outline" onClick={() => openCreate("professor")}>
              <Plus /> Add professor
            </Button>
            <Button onClick={() => openCreate("student")}>
              <Plus /> Add student
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search users…"
                className="pl-9"
              />
            </div>
            <Select
              value={roleFilter || "all"}
              onValueChange={(value) => {
                setRoleFilter(value === "all" ? "" : (value as Role));
                setPage(1);
              }}
            >
              <SelectTrigger className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="professor">Professor</SelectItem>
                <SelectItem value="student">Student</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{resource.data?.total ?? 0} user(s)</p>
        </div>

        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton columns={7} />}
          emptyTitle="No users found"
          emptyDescription="Add a student or professor to get started."
        >
          {(data) =>
            data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No users match your filters.</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                              {initials(user.full_name || user.email)}
                            </span>
                            <div>
                              <p className="font-medium">{user.full_name}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.university_id || user.employee_id || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleVariant[user.role]} className="capitalize">{user.role}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.department_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? "success" : "secondary"}>
                            {user.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <RowActions
                            onEdit={() => openEdit(user)}
                            onDelete={() => setDeleting(user)}
                            label={`Actions for ${user.full_name}`}
                            extra={
                              user.role === "admin" ? null : (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setResetting(user);
                                      setResetPassword("");
                                      setResetError(null);
                                    }}
                                  >
                                    <KeyRound /> Reset password
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  page={data.page}
                  pages={data.pages}
                  total={data.total}
                  pageSize={data.page_size}
                  onPageChange={setPage}
                />
              </>
            )
          }
        </QueryState>
      </Card>

      <BulkImportHistory key={historyRefresh} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit user" : form.role === "professor" ? "Add professor" : "Add student"}
            </DialogTitle>
            <DialogDescription>
              Student and professor profiles are created with their accounts. Passwords can be reset later from the row menu.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField label="Role" htmlFor="user-role" required error={fieldErrors.role}>
              <Select
                value={form.role}
                disabled={Boolean(editing)}
                onValueChange={(value) => setForm((current) => ({ ...current, role: value as Role }))}
              >
                <SelectTrigger id="user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="professor">Professor</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Full name" htmlFor="user-name" required error={fieldErrors.full_name}>
              <Input
                id="user-name"
                value={form.full_name}
                onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
              />
            </FormField>
            <FormField label="Email" htmlFor="user-email" required error={fieldErrors.email}>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </FormField>
            <FormField label="Phone" htmlFor="user-phone" error={fieldErrors.phone}>
              <Input
                id="user-phone"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </FormField>
            {form.role === "student" ? (
              <>
                <FormField label="University ID" htmlFor="user-uid" required={!editing} error={fieldErrors.university_id}>
                  <Input
                    id="user-uid"
                    value={form.university_id}
                    onChange={(event) => setForm((current) => ({ ...current, university_id: event.target.value }))}
                  />
                </FormField>
                <FormField label="Program" htmlFor="user-program" error={fieldErrors.program}>
                  <Input
                    id="user-program"
                    value={form.program}
                    onChange={(event) => setForm((current) => ({ ...current, program: event.target.value }))}
                    placeholder="e.g. Computer Science"
                  />
                </FormField>
                <FormField label="Year level" htmlFor="user-year" error={fieldErrors.year_level}>
                  <Input
                    id="user-year"
                    type="number"
                    min={1}
                    max={8}
                    value={form.year_level}
                    onChange={(event) => setForm((current) => ({ ...current, year_level: event.target.value }))}
                  />
                </FormField>
              </>
            ) : (
              <>
                <FormField label="Employee ID" htmlFor="user-eid" required={!editing} error={fieldErrors.employee_id}>
                  <Input
                    id="user-eid"
                    value={form.employee_id}
                    onChange={(event) => setForm((current) => ({ ...current, employee_id: event.target.value }))}
                  />
                </FormField>
                <FormField label="Title" htmlFor="user-title" error={fieldErrors.title}>
                  <Input
                    id="user-title"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="e.g. Dr."
                  />
                </FormField>
                <FormField label="Office" htmlFor="user-office" error={fieldErrors.office}>
                  <Input
                    id="user-office"
                    value={form.office}
                    onChange={(event) => setForm((current) => ({ ...current, office: event.target.value }))}
                  />
                </FormField>
              </>
            )}
            <FormField label="Department" htmlFor="user-department">
              <Select
                value={form.department_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, department_id: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="user-department">
                  <SelectValue placeholder="No department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No department</SelectItem>
                  {(departments.data ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {editing ? (
              <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium">Active account</p>
                  <p className="text-xs text-muted-foreground">Inactive users cannot sign in.</p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, is_active: checked }))}
                  aria-label="Active account"
                />
              </div>
            ) : (
              <FormField label="Password" htmlFor="user-password" required error={fieldErrors.password}>
                <Input
                  id="user-password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="At least 8 characters"
                />
              </FormField>
            )}
            {formError ? (
              <p className="sm:col-span-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editing ? "Save changes" : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(resetting)}
        onOpenChange={(open) => {
          if (!open) {
            setResetting(null);
            setResetPassword("");
            setResetError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetting?.full_name ?? "this user"}. Their active sessions will be revoked.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReset} className="grid gap-4">
            <FormField label="New password" htmlFor="reset-password" required error={resetError ?? undefined}>
              <Input
                id="reset-password"
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetting(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={resetLoading}>
                Reset password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onUploaded={() => {
          resource.reload();
          setHistoryRefresh((value) => value + 1);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete user?"
        description={`${deleting?.full_name ?? "This user"} will lose access immediately. This action cannot be undone.`}
        loading={deleteLoading}
        confirmLabel="Delete user"
        onConfirm={handleDelete}
      />
    </div>
  );
}
