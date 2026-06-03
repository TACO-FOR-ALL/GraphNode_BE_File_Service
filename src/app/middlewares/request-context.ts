import type { Request, Response, NextFunction } from 'express';
import { ulid } from 'ulid';

import { runWithRequestContext } from '../../shared/context/requestStore';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    ulid();

  res.setHeader('X-Correlation-Id', correlationId);

  const userId = req.headers['x-user-id'] as string | undefined;

  runWithRequestContext({ correlationId, userId }, () => next());
}
