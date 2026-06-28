import type { Request, Response, NextFunction } from 'express';

import { AppError, unknownToAppError } from '../../shared/errors/base';
import { getCorrelationId } from '../../shared/context/requestStore';
import { logger } from '../../shared/utils/logger';
import { toProblem } from '../presenters/problem';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appErr = err instanceof AppError ? err : unknownToAppError(err);
  const correlationId = getCorrelationId();
  const causeMessage =
    err instanceof Error && err !== appErr ? err.message : undefined;

  const payload = {
    event: appErr.httpStatus >= 500 ? 'fs.http.error' : 'fs.http.client_error',
    correlationId,
    method: req.method,
    path: req.path,
    errorCode: appErr.code,
    httpStatus: appErr.httpStatus,
    retryable: appErr.retryable,
    errMessage: appErr.message,
    causeMessage,
  };

  if (appErr.httpStatus >= 500) {
    logger.error({ ...payload, err: appErr }, 'File Service request error');
  } else if (appErr.httpStatus >= 400) {
    logger.warn(payload, 'File Service client error');
  }

  res.status(appErr.httpStatus).json(toProblem(appErr, req.originalUrl, correlationId));
}
