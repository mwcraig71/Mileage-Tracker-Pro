import nodemailer from "nodemailer";
import { logger } from "./logger";

/** Escape a string for safe interpolation into HTML email bodies. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS ?? process.env.SENDGRID_API_KEY;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from) return null;

  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
  };
}

export interface AlertEmailParams {
  to: string;
  contactName: string;
  truckName: string;
  alertDate: string;
  issue: "no_session" | "no_project";
}

export async function sendAlertEmail(params: AlertEmailParams): Promise<void> {
  const cfg = getTransporter();
  if (!cfg) {
    logger.warn(
      { truckName: params.truckName },
      "SMTP not configured — skipping alert email (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)"
    );
    return;
  }

  const issueText =
    params.issue === "no_session"
      ? "No driver session was logged for this truck."
      : "A driver session was logged but no project was assigned.";

  const appUrl = process.env.APP_URL ?? "https://mileage-tracker-pro.replit.app";

  const subject = `FleetLog Alert: ${params.truckName} moved without a complete log on ${params.alertDate}`;

  const text = `Hi ${params.contactName},

FleetLog detected that ${params.truckName} had GPS movement on ${params.alertDate} but the log is incomplete.

Issue: ${issueText}

Open FleetLog to review and resolve: ${appUrl}

Please ensure the driver logs their session and project as soon as possible.

— FleetLog Daily Accountability Check`;

  const safeContactName = escapeHtml(params.contactName);
  const safeTruckName = escapeHtml(params.truckName);
  const safeAlertDate = escapeHtml(params.alertDate);

  const html = `
<p>Hi ${safeContactName},</p>
<p><strong>FleetLog</strong> detected that <strong>${safeTruckName}</strong> had GPS movement on <strong>${safeAlertDate}</strong> but the log is incomplete.</p>
<p><strong>Issue:</strong> ${issueText}</p>
<p style="margin:20px 0">
  <a href="${appUrl}" style="display:inline-block;background:#d97706;color:#fff;font-weight:bold;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px">
    Open FleetLog &rarr;
  </a>
</p>
<p style="font-size:13px;color:#555">Please ensure the driver logs their session and project as soon as possible.</p>
<hr/>
<p style="color:#888;font-size:12px">FleetLog Daily Accountability Check</p>
`;

  try {
    await cfg.transport.sendMail({ from: cfg.from, to: params.to, subject, text, html });
    logger.info({ to: params.to, truckName: params.truckName }, "Alert email sent");
  } catch (err) {
    logger.error({ err, to: params.to }, "Failed to send alert email");
  }
}
