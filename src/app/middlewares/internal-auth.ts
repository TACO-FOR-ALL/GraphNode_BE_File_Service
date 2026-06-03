/**
 * 모듈: internal-auth 미들웨어
 *
 * GraphNode BFF만 File Service를 호출할 수 있도록 합니다.
 * - X-Internal-Api-Key: env.INTERNAL_API_KEY 와 일치
 * - X-User-Id: BFF가 세션에서 추출한 사용자 ID (본 서비스는 쿠키 검증 안 함)
 */
import type { Request, Response, NextFunction } from 'express';

import { loadEnv } from '../../config/env';
import { AuthError, ValidationError } from '../../shared/errors/domain';

export function internalAuth(req: Request, _res: Response, next: NextFunction): void {
  const env = loadEnv();
  const key = req.headers['x-internal-api-key'];
  if (!key || key !== env.INTERNAL_API_KEY) {
    return next(new AuthError('Invalid internal API key'));
  }
  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return next(new ValidationError('X-User-Id header is required'));
  }
  (req as Request & { internalUserId: string }).internalUserId = userId.trim();
  next();
}
