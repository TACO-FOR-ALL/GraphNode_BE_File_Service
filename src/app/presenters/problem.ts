import type { AppError } from '../../shared/errors/base';

export function toProblem(err: AppError, instance: string, correlationId?: string) {
  return {
    type: `https://graphnode.dev/problems/${err.code.toLowerCase().replace(/_/g, '-')}`,
    title: err.code,
    status: err.httpStatus,
    detail: err.message,
    instance,
    correlationId,
    code: err.code,
    retryable: err.retryable,
    details: err.details,
  };
}
