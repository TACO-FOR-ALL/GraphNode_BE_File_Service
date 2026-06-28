import type { Request, Response, NextFunction } from 'express';

import { getCorrelationId, getRequestUserId } from '../../shared/context/requestStore';
import { logger } from '../../shared/utils/logger';

/**
 * /internal 요청 시작·완료 로그 (correlationId로 BE CloudWatch와 연결).
 */
export function httpLog(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  const correlationId = getCorrelationId();
  const path = req.originalUrl;

  logger.info(
    {
      event: 'fs.http.request.start',
      correlationId,
      userId: getRequestUserId(),
      method: req.method,
      path,
    },
    'Internal request received'
  );

  res.on('finish', () => {
    const durationMs = Date.now() - started;
    const status = res.statusCode;
    const base = {
      event:
        status >= 500
          ? 'fs.http.request.server_error'
          : status >= 400
            ? 'fs.http.request.client_error'
            : 'fs.http.request.success',
      correlationId,
      userId: getRequestUserId(),
      method: req.method,
      path,
      status,
      durationMs,
    };

    if (status >= 500) {
      logger.error(base, 'Internal request failed');
    } else if (status >= 400) {
      logger.warn(base, 'Internal request rejected');
    } else {
      logger.info(base, 'Internal request completed');
    }
  });

  next();
}
