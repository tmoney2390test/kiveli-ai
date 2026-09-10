export type SupportEmailDeliveryStatus = "sent" | "not_configured" | "failed";

export type SupportEmailDelivery = {
  status: SupportEmailDeliveryStatus;
  providerId?: string;
  errorCode?: string;
};

export function supportTicketReference(ticketNumber: number): string {
  const normalized = Number.isSafeInteger(ticketNumber) && ticketNumber > 0
    ? ticketNumber
    : 0;
  return `Support-${String(normalized).padStart(5, "0")}`;
}

export function supportTicketEmailSubject(
  ticketNumber: number,
  subject: string,
): string {
  const safeSubject = subject.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ")
    .trim().slice(0, 160);
  return `[${supportTicketReference(ticketNumber)}] ${safeSubject}`;
}

export async function sendSupportTicketEmail(input: {
  ticketId: string;
  ticketNumber: number;
  category: string;
  subject: string;
  message: string;
  userId: string;
  userEmail?: string | null;
  correlationId: string;
  createdAt: string;
}): Promise<SupportEmailDelivery> {
  const apiKey = Deno.env.get("RESEND_API_KEY"),
    from = Deno.env.get("KIVELLE_SUPPORT_EMAIL_FROM") ??
      Deno.env.get("KIVELLE_OPS_ALERT_FROM"),
    to = Deno.env.get("KIVELLE_SUPPORT_EMAIL") ?? "support@kivelli.app";
  if (!apiKey || !from || !to) return { status: "not_configured" };

  const reference = supportTicketReference(input.ticketNumber),
    publicAppUrl = (Deno.env.get("KIVELLE_PUBLIC_APP_URL") || "https://kivelli.app")
      .replace(/\/+$/, ""),
    text = [
      `Ticket: ${reference}`,
      `Category: ${input.category}`,
      `Account: ${input.userEmail ?? "No account email available"}`,
      `User ID: ${input.userId}`,
      `Created: ${input.createdAt}`,
      `Correlation ID: ${input.correlationId}`,
      "",
      `Subject: ${input.subject}`,
      "",
      input.message,
      "",
      `Open in Kivelle Ops: ${publicAppUrl}/ops`,
    ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "Idempotency-Key": `support-ticket-${input.ticketId}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: supportTicketEmailSubject(input.ticketNumber, input.subject),
        text,
        ...(input.userEmail ? { reply_to: input.userEmail } : {}),
        tags: [{ name: "ticket", value: reference }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { status: "failed", errorCode: `http_${response.status}` };
    const payload = await response.json().catch(() => ({})) as { id?: unknown };
    return {
      status: "sent",
      ...(typeof payload.id === "string" ? { providerId: payload.id } : {}),
    };
  } catch {
    return { status: "failed", errorCode: "request_failed" };
  }
}
