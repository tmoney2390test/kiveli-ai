export const SUPPORT_SUBJECT_MAX_LENGTH = 160;
export const SUPPORT_MESSAGE_MAX_LENGTH = 5000;

export function supportFormErrors(subject: string, message: string, reply = false) {
  const subjectLength = subject.trim().length, messageLength = message.trim().length;
  return {
    subject: reply ? '' : subjectLength < 3 ? 'Add a subject with at least 3 characters.'
      : subjectLength > SUPPORT_SUBJECT_MAX_LENGTH ? 'Keep the subject under 161 characters.' : '',
    message: messageLength < (reply ? 2 : 10)
      ? reply ? 'Add a reply with at least 2 characters.' : 'Tell us a little more (at least 10 characters).'
      : messageLength > SUPPORT_MESSAGE_MAX_LENGTH ? 'Keep your message under 5,001 characters.' : '',
  };
}

export function canSubmitSupportRequest(subject: string, message: string): boolean {
  const errors = supportFormErrors(subject, message);
  return !errors.subject && !errors.message;
}

export function canSubmitSupportReply(message: string): boolean {
  return !supportFormErrors('', message, true).message;
}

export function formatSupportTicketReference(ticketNumber: number): string {
  const normalized = Number.isSafeInteger(ticketNumber) && ticketNumber > 0
    ? ticketNumber
    : 0;
  return `Support-${String(normalized).padStart(5, "0")}`;
}
