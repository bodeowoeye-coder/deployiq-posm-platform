import type { Submission } from "@/lib/types";

export type AlertType = "brand_mismatch" | "duplicate_suspected" | "submission_rejected" | "high_risk_installer";

export function buildAlertEvent({
  alertType,
  submission,
  severity,
  message
}: {
  alertType: AlertType;
  submission: Pick<Submission, "id" | "installer_name" | "brand_name" | "detected_brand_name" | "duplicate_status" | "status">;
  severity: "medium" | "high";
  message: string;
}) {
  return {
    submission_id: submission.id,
    alert_type: alertType,
    severity,
    recipient_role: "admin",
    delivery_channel: "email",
    delivery_status: "ready",
    payload: {
      message,
      installer_name: submission.installer_name,
      selected_brand: submission.brand_name,
      detected_brand: submission.detected_brand_name,
      duplicate_status: submission.duplicate_status,
      status: submission.status
    }
  };
}
