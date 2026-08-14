export type ErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'LEGAL_ACCEPTANCE_REQUIRED' | 'VALIDATION_FAILED' | 'RATE_LIMITED' | 'NOT_FOUND' | 'CONFLICT' | 'PROVIDER_UNAVAILABLE' | 'INTERNAL_ERROR';
export class AppError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly status: number, readonly retryable = false) { super(message); this.name = 'AppError'; }
}
