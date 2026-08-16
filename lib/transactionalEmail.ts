export type TransactionalEmail = {
  to: string;
  subject: string;
  body: string;
};

export type TransactionalEmailResult =
  | { ok: true; deliveryMode: "development_simulated" | "transactional_provider" }
  | {
      ok: false;
      deliveryMode: "provider_missing" | "transactional_provider";
      failureCode:
        | "email_provider_not_configured"
        | "email_provider_rejected"
        | "email_provider_timeout"
        | "email_delivery_failed";
    };

const ZEPTOMAIL_ENDPOINT = "https://api.zeptomail.com/v1.1/email";
const EMAIL_TIMEOUT_MS = 10_000;

export function isProductionEmailRuntime() {
  return process.env.NODE_ENV === "production"
    || process.env.VERCEL_ENV === "production"
    || process.env.DEPLOYIQ_RUNTIME_ENV === "production";
}

export function deployiqAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "")
    || process.env.DEPLOYIQ_APP_URL?.replace(/\/+$/, "")
    || "http://localhost:3000";
}

export async function sendTransactionalEmail(email: TransactionalEmail): Promise<TransactionalEmailResult> {
  if (!isProductionEmailRuntime()) return { ok: true, deliveryMode: "development_simulated" };

  const provider = process.env.DEPLOYIQ_TRANSACTIONAL_EMAIL_PROVIDER?.trim().toLowerCase() || "";
  const endpoint = process.env.DEPLOYIQ_TRANSACTIONAL_EMAIL_ENDPOINT?.trim() || ZEPTOMAIL_ENDPOINT;
  const token = process.env.DEPLOYIQ_TRANSACTIONAL_EMAIL_TOKEN?.trim() || "";
  const fromAddress = process.env.DEPLOYIQ_TRANSACTIONAL_EMAIL_FROM_ADDRESS?.trim() || "";
  const fromName = process.env.DEPLOYIQ_TRANSACTIONAL_EMAIL_FROM_NAME?.trim() || "DeployIQ";
  if (provider !== "zeptomail" || !endpoint || !token || !fromAddress) {
    return { ok: false, deliveryMode: "provider_missing", failureCode: "email_provider_not_configured" };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Zoho-enczapikey ${token}`,
      },
      body: JSON.stringify({
        from: { address: fromAddress, name: fromName },
        to: [{ email_address: { address: email.to } }],
        subject: email.subject,
        textbody: email.body,
      }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    return response.ok
      ? { ok: true, deliveryMode: "transactional_provider" }
      : { ok: false, deliveryMode: "transactional_provider", failureCode: "email_provider_rejected" };
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      return { ok: false, deliveryMode: "transactional_provider", failureCode: "email_provider_timeout" };
    }
    return { ok: false, deliveryMode: "transactional_provider", failureCode: "email_delivery_failed" };
  }
}
