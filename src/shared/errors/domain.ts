import { AppError } from './base';

export { AppError };

export class ValidationError extends AppError {
  code = 'VALIDATION_FAILED';
  httpStatus = 400;
}

export class AuthError extends AppError {
  code = 'AUTH_REQUIRED';
  httpStatus = 401;
}

export class ForbiddenError extends AppError {
  code = 'FORBIDDEN';
  httpStatus = 403;
}

export class NotFoundError extends AppError {
  code = 'NOT_FOUND';
  httpStatus = 404;
}

export class ConflictError extends AppError {
  code = 'CONFLICT';
  httpStatus = 409;
}

export class ImportJobNotReadyError extends AppError {
  code = 'IMPORT_JOB_NOT_READY';
  httpStatus = 409;
}

export class ProviderNotImplementedError extends AppError {
  code = 'PROVIDER_NOT_IMPLEMENTED';
  httpStatus = 501;
}

export class ImportQuotaExceededError extends AppError {
  code = 'IMPORT_QUOTA_EXCEEDED';
  httpStatus = 429;
  retryable = true;
}

export class InvalidArchiveError extends AppError {
  code = 'INVALID_ARCHIVE';
  httpStatus = 400;
}

export class UpstreamError extends AppError {
  code = 'UPSTREAM_ERROR';
  httpStatus = 502;
  retryable = true;
}
