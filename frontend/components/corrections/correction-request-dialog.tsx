"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { AttendanceStatus, CorrectionRequestPayload } from "@/lib/types";

const REQUEST_STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "excused", label: "Excused" },
];

interface CorrectionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  recordId?: string | null;
  defaultRequestedStatus?: AttendanceStatus;
  onSuccess?: () => void;
}

export function CorrectionRequestDialog({
  open,
  onOpenChange,
  sessionId,
  recordId,
  defaultRequestedStatus,
  onSuccess,
}: CorrectionRequestDialogProps) {
  const [requestedStatus, setRequestedStatus] = useState<AttendanceStatus>("present");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRequestedStatus(defaultRequestedStatus ?? "present");
    setReason("");
    setFieldErrors({});
    setFormError(null);
  }, [defaultRequestedStatus, open, recordId, sessionId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const trimmedReason = reason.trim();
    if (!sessionId.trim()) {
      nextErrors.session_id = "Choose an attendance record first.";
    }
    if (!requestedStatus) {
      nextErrors.requested_status = "Choose the correct attendance status.";
    }
    if (trimmedReason.length < 10) {
      nextErrors.reason = "Describe the issue in at least 10 characters.";
    } else if (trimmedReason.length > 500) {
      nextErrors.reason = "Use 500 characters or fewer.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload: CorrectionRequestPayload = {
      session_id: sessionId.trim(),
      ...(recordId ? { record_id: recordId } : {}),
      requested_status: requestedStatus,
      reason: trimmedReason,
    };

    setSaving(true);
    setFormError(null);
    try {
      await api.post<unknown>("/attendance/correction-requests", payload);
      toast.success("Correction request submitted");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      const message = errorMessage(error);
      setFormError(message);
      toast.error(message);
      if (error instanceof ApiError) setFieldErrors(error.fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request attendance correction</DialogTitle>
          <DialogDescription>
            Explain what should change. Your professor reviews the request before any record is updated.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-4"
          noValidate
        >
          <FormField
            label="Session ID"
            htmlFor="correction-session"
            required
            error={fieldErrors.session_id}
            hint="Taken from the attendance record."
          >
            <Input
              id="correction-session"
              value={sessionId}
              readOnly
              aria-invalid={Boolean(fieldErrors.session_id)}
            />
          </FormField>
          <FormField
            label="Correct status"
            htmlFor="correction-status"
            required
            error={fieldErrors.requested_status}
          >
            <Select
              value={requestedStatus}
              onValueChange={(value) => setRequestedStatus(value as AttendanceStatus)}
            >
              <SelectTrigger id="correction-status">
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_STATUSES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            label="Reason"
            htmlFor="correction-reason"
            required
            error={fieldErrors.reason}
            hint={`${reason.trim().length}/500 characters · at least 10 required`}
          >
            <Textarea
              id="correction-reason"
              value={reason}
              maxLength={500}
              placeholder="Tell your professor why this record should change…"
              aria-invalid={Boolean(fieldErrors.reason)}
              onChange={(event) => {
                setReason(event.target.value);
                setFieldErrors((current) => ({ ...current, reason: "" }));
              }}
            />
          </FormField>
          {formError ? (
            <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!sessionId.trim()}>
              Submit request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
