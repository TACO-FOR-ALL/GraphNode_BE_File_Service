export abstract class AppError extends Error {
  abstract code: string;
  abstract httpStatus: number;
  retryable = false;
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}

export function unknownToAppError(err: unknown): AppError {
  const e = err as { name?: string; issues?: unknown; code?: string; message?: string; details?: Record<string, unknown> };
  if (e?.name === 'ZodError' || Array.isArray(e?.issues)) {
    const { ValidationError } = require('./domain');
    return new ValidationError('Validation failed', { issues: e.issues });
  }
  if (e && typeof e.code === 'string' && e instanceof AppError) {
    return e;
  }
  if (e && typeof e.code === 'string') {
    const { ValidationError, AuthError, NotFoundError, ForbiddenError, ConflictError, ProviderNotImplementedError, ImportQuotaExceededError, InvalidArchiveError } = require('./domain');
    const message = e.message || e.code;
    switch (e.code) {
      case 'VALIDATION_FAILED':
        return new ValidationError(message, e.details);
      case 'AUTH_REQUIRED':
        return new AuthError(message, e.details);
      case 'NOT_FOUND':
        return new NotFoundError(message, e.details);
      case 'FORBIDDEN':
        return new ForbiddenError(message, e.details);
      case 'CONFLICT':
        return new ConflictError(message, e.details);
      case 'PROVIDER_NOT_IMPLEMENTED':
        return new ProviderNotImplementedError(message, e.details);
      case 'IMPORT_QUOTA_EXCEEDED':
        return new ImportQuotaExceededError(message, e.details);
      case 'INVALID_ARCHIVE':
        return new InvalidArchiveError(message, e.details);
      default:
        break;
    }
  }
  const message = (e as Error)?.message || 'Unknown error';
  return new (class extends AppError {
    code = 'UNKNOWN_ERROR';
    httpStatus = 500;
  })(message);
}
