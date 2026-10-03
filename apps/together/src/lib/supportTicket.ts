export const SUPPORT_SUBJECT_MAX_LENGTH = 160;
export const SUPPORT_MESSAGE_MAX_LENGTH = 5000;

export function canSubmitSupportRequest(subject: string, message: string): boolean {
  const subjectLength = subject.trim().length;
  const messageLength = message.trim().length;
  return subjectLength >= 3 && subjectLength <= SUPPORT_SUBJECT_MAX_LENGTH &&
    messageLength >= 10 && messageLength <= SUPPORT_MESSAGE_MAX_LENGTH;
}

export function canSubmitSupportReply(message: string): boolean {
  const length = message.trim().length;
  return length >= 2 && length <= SUPPORT_MESSAGE_MAX_LENGTH;
}

export function formatSupportTicketReference(ticketNumber: number): string {
  const normalized = Number.isSafeInteger(ticketNumber) && ticketNumber > 0
    ? ticketNumber
    : 0;
  return `Support-${String(normalized).padStart(5, "0")}`;
}
