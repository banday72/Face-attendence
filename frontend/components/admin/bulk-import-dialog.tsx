"use client";

import { AlertCircle, Download, RefreshCw, Upload } from "lucide-react";
import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { QueryState } from "@/components/common/query-state";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import {
  normalizeBulkImportPreview,
  normalizeBulkImportResult,
  normalizeBulkImportUpload,
} from "@/lib/normalize";
import type {
  BulkImportError,
  BulkImportPreview,
  BulkImportResult,
  BulkImportUpload,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type WizardStep = "file" | "preview" | "result";
type RetryAction = "template" | "preview" | "upload" | null;

interface WizardError {
  message: string;
  retry: RetryAction;
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: () => void;
}

interface ImportStatProps {
  label: string;
  value: number;
  tone?: "default" | "success" | "destructive";
}

const wizardSteps: { id: WizardStep; label: string }[] = [
  { id: "file", label: "Choose file" },
  { id: "preview", label: "Preview" },
  { id: "result", label: "Result" },
];

function formatSampleValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const formatted = value.map(formatSampleValue).join(", ");
    return formatted || "—";
  }
  return JSON.stringify(value) ?? "—";
}

function StepIndicator({ step }: { step: WizardStep }) {
  const activeIndex = wizardSteps.findIndex((item) => item.id === step);
  return (
    <ol className="flex flex-wrap gap-2 border-b border-border pb-4">
      {wizardSteps.map((item, index) => (
        <li
          key={item.id}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
            index === activeIndex
              ? "border-primary bg-primary/10 text-primary"
              : index < activeIndex
                ? "border-success/30 bg-success/10 text-success"
                : "border-border text-muted-foreground",
          )}
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-background/70 text-[10px] font-semibold">
            {index + 1}
          </span>
          {item.label}
        </li>
      ))}
    </ol>
  );
}

function ImportStat({ label, value, tone = "default" }: ImportStatProps) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
  }[tone];
  return (
    <div className="rounded-md border border-border p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold", toneClass)}>{value.toLocaleString()}</p>
    </div>
  );
}

function ImportErrorTable({ errors }: { errors: BulkImportError[] }) {
  return (
    <div className="max-h-52 overflow-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Row</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Problem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {errors.map((error, index) => (
            <TableRow key={`${error.row}-${error.email}-${index}`}>
              <TableCell className="font-medium">{error.row > 0 ? error.row : "—"}</TableCell>
              <TableCell className="text-muted-foreground">{error.email || "—"}</TableCell>
              <TableCell className="text-sm text-destructive">{error.error || "Unknown error"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function BulkImportDialog({
  open,
  onOpenChange,
  onUploaded,
}: BulkImportDialogProps) {
  const [step, setStep] = useState<WizardStep>("file");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BulkImportPreview | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState<WizardError | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("file");
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setPreviewing(false);
    setUploading(false);
    setDownloadingTemplate(false);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleTemplateDownload = async () => {
    setDownloadingTemplate(true);
    setError(null);
    try {
      await api.download("/admin/users/bulk/template", "users_bulk_template.csv");
      toast.success("Template downloaded");
    } catch (caught) {
      setError({ message: errorMessage(caught), retry: "template" });
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError(null);
    if (!selected) return;
    const isCsv = selected.name.toLowerCase().endsWith(".csv") || selected.type === "text/csv";
    if (!isCsv) {
      setFile(null);
      setPreview(null);
      setResult(null);
      setError({ message: "Choose a .csv file.", retry: null });
      return;
    }
    if (selected.size === 0) {
      setFile(null);
      setPreview(null);
      setResult(null);
      setError({ message: "The selected file is empty.", retry: null });
      return;
    }
    setFile(selected);
    setPreview(null);
    setResult(null);
    setStep("file");
  };

  const handlePreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const payload: unknown = await api.post<unknown>("/admin/users/bulk/preview", formData);
      setPreview(normalizeBulkImportPreview(payload));
      setStep("preview");
    } catch (caught) {
      setError({ message: errorMessage(caught), retry: "preview" });
    } finally {
      setPreviewing(false);
    }
  };

  const handleUpload = async () => {
    if (!file || !preview) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const payload: unknown = await api.post<unknown>("/admin/users/bulk", formData);
      const imported = normalizeBulkImportResult(payload);
      setResult(imported);
      setStep("result");
      onUploaded?.();
      toast.success(`Imported ${imported.created} of ${imported.total} users`);
    } catch (caught) {
      setError({ message: errorMessage(caught), retry: "upload" });
    } finally {
      setUploading(false);
    }
  };

  const handleRetry = () => {
    if (error?.retry === "template") void handleTemplateDownload();
    if (error?.retry === "preview") void handlePreview();
    if (error?.retry === "upload") void handleUpload();
  };

  const sampleColumns = preview
    ? Array.from(new Set(preview.samples.flatMap((sample) => Object.keys(sample))))
    : [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk import users</DialogTitle>
          <DialogDescription>
            {step === "file"
              ? "Download the template, choose your CSV, and check it before creating accounts."
              : step === "preview"
                ? "Review the parsed rows and validation errors before confirming the upload."
                : "Review the import summary and any rows that could not be created."}
          </DialogDescription>
        </DialogHeader>
        <StepIndicator step={step} />

        {error ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-md border border-destructive/25 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error.message}</p>
            </div>
            {error.retry ? (
              <Button type="button" size="sm" variant="outline" onClick={handleRetry}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === "file" ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Start with the CSV template</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The template lists the supported columns for students, professors, and admins.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                loading={downloadingTemplate}
                onClick={() => void handleTemplateDownload()}
              >
                <Download /> Download template
              </Button>
            </div>

            <div className="rounded-md border border-dashed border-border p-5 text-center">
              <Upload className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">{file ? file.name : "Choose a CSV file"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {file ? `${file.size.toLocaleString()} bytes · Ready to preview` : "CSV files only"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                aria-label="CSV file"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? "Choose another file" : "Choose file"}
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                loading={previewing}
                disabled={!file || downloadingTemplate}
                onClick={() => void handlePreview()}
              >
                Preview import
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "preview" && preview ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <ImportStat label="Rows" value={preview.total} />
              <ImportStat label="Valid" value={preview.valid} tone="success" />
              <ImportStat label="Errors" value={preview.errors.length} tone="destructive" />
            </div>

            <div className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold">Valid row samples</h3>
                <p className="text-xs text-muted-foreground">
                  These records will be created when you confirm the upload.
                </p>
              </div>
              {preview.samples.length ? (
                <div className="max-h-52 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {sampleColumns.map((column) => (
                          <TableHead key={column}>{column.replaceAll("_", " ")}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.samples.map((sample, index) => (
                        <TableRow key={`sample-${index}`}>
                          {sampleColumns.map((column) => (
                            <TableCell key={column} className="text-xs">
                              {formatSampleValue(sample[column])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  title="No sample rows"
                  description="The preview did not include any valid sample rows."
                  className="py-8"
                />
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Validation errors</h3>
              {preview.errors.length ? (
                <ImportErrorTable errors={preview.errors} />
              ) : (
                <p className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                  No validation errors found.
                </p>
              )}
            </div>

            {preview.valid === 0 ? (
              <p className="rounded-md border border-warning/25 bg-warning/10 p-3 text-sm text-warning-foreground">
                No valid rows to import. Go back and correct the CSV before uploading.
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => {
                  setError(null);
                  setStep("file");
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                loading={uploading}
                disabled={preview.valid === 0}
                onClick={() => void handleUpload()}
              >
                Confirm upload
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "result" && result ? (
          <div className="space-y-4">
            <div className="rounded-md border border-success/25 bg-success/5 p-4">
              <p className="font-semibold text-success">Import complete</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.created} account(s) created and {result.failed} row(s) failed.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <ImportStat label="Rows" value={result.total} />
              <ImportStat label="Created" value={result.created} tone="success" />
              <ImportStat label="Failed" value={result.failed} tone="destructive" />
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Row errors</h3>
              {result.errors.length ? (
                <ImportErrorTable errors={result.errors} />
              ) : (
                <p className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                  All rows imported successfully.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function BulkImportHistory() {
  const [page, setPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loader = useCallback(
    () =>
      api.getPaginated<BulkImportUpload>("/admin/users/bulk/uploads", normalizeBulkImportUpload, {
        query: { page, page_size: 10 },
      }),
    [page],
  );
  const resource = useResource(loader);

  const handleDownloadErrors = async (upload: BulkImportUpload) => {
    setDownloadingId(upload.id);
    try {
      const safeName =
        upload.filename.replace(/\.csv$/i, "").replace(/[^a-z0-9_-]+/gi, "_") || "upload";
      await api.download(
        `/admin/users/bulk/uploads/${encodeURIComponent(upload.id)}/errors.csv`,
        `${safeName}_errors.csv`,
      );
      toast.success("Error CSV downloaded");
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Bulk import history</h2>
          <p className="text-xs text-muted-foreground">
            Recent CSV uploads and their row-level errors.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resource.reload}>
          <RefreshCw /> Refresh
        </Button>
      </div>
      <QueryState
        loading={resource.loading}
        error={resource.error}
        data={resource.data}
        onRetry={resource.reload}
        skeleton={<TableSkeleton columns={6} />}
        emptyTitle="No bulk imports yet"
        emptyDescription="Upload a CSV file to see import history here."
      >
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              title="No bulk imports yet"
              description="Upload a CSV file to see import history here."
              className="m-4"
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead>Uploaded by</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Totals</TableHead>
                    <TableHead className="w-36" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((upload) => (
                    <TableRow key={upload.id}>
                      <TableCell className="max-w-[16rem] truncate font-medium" title={upload.filename}>
                        {upload.filename}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {upload.actor_name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {upload.created_at ? new Date(upload.created_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{upload.total} rows</span>
                          <Badge variant="success">{upload.created} created</Badge>
                          <Badge variant={upload.failed > 0 ? "destructive" : "secondary"}>
                            {upload.failed} failed
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          loading={downloadingId === upload.id}
                          disabled={downloadingId !== null && downloadingId !== upload.id}
                          onClick={() => void handleDownloadErrors(upload)}
                        >
                          <Download /> Error CSV
                        </Button>
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
  );
}
