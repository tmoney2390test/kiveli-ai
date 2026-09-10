export const SUPPORT_SUBJECT_MAX_LENGTH = 160;
export const SUPPORT_MESSAGE_MAX_LENGTH = 5000;

export function canSubmitSupportRequest(subject: string, message: string): boolean {
  return subject.trim().length >= 3 && message.trim().length >= 10;
}

export function formatSupportTicketReference(ticketNumber: number): string {
  const normalized = Number.isSafeInteger(ticketNumber) && ticketNumber > 0
    ? ticketNumber
    : 0;
  return `Support-${String(normalized).padStart(5, "0")}`;
}
