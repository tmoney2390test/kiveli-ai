export const EMAIL_CODE_LENGTH = 6;
export const EMAIL_CODE_RESEND_SECONDS = 60;

export function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeEmailCode(value: string) {
  return value.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
}

export function emailCodeReady(value: string) {
  return normalizeEmailCode(value).length === EMAIL_CODE_LENGTH;
}

export function emailCodeResendSeconds(availableAt: number, now: number) {
  return Math.max(0, Math.ceil((availableAt - now) / 1000));
}
