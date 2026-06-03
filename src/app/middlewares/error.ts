import type { Request, Response, NextFunction } from 'express';

import { AppError, unknownToAppError } from '../../shared/errors/base';
import { getCorrelationId } from '../../shared/context/requestStore';
import { logger } from '../../shared/utils/logger';
import { toProblem } from '../presenters/problem';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appErr = err instanceof AppError ? err : unknownToAppError(err);
  const correlationId = getCorrelationId();

  if (appErr.httpStatus >= 500) {
    logger.error({ err: appErr, correlationId, path: req.path }, 'Unhandled application error');
  }

  res.status(appErr.httpStatus).json(toProblem(appErr, req.originalUrl, correlationId));
}
