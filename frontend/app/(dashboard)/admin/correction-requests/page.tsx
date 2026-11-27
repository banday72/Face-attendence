"use client";

import { CorrectionQueue } from "@/components/corrections/correction-queue";
import { PageHeader } from "@/components/common/page-header";

export default function AdminCorrectionRequestsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance"
        title="Correction requests"
        description="Review attendance correction requests submitted across all classes."
      />
      <CorrectionQueue scope="admin" />
    </div>
  );
}
