/**
 * 모듈: Express API 서버 부트스트랩
 *
 * - /healthz: 헬스체크
 * - /internal/*: BFF 전용 (internal-auth 미들웨어)
 */
import express from 'express';
import cors from 'cors';

import { loadEnv } from '../config/env';
import healthRouter from '../app/routes/HealthRouter';
import { createInternalRouter } from '../app/routes/InternalRouter';
import { requestContext } from '../app/middlewares/request-context';
import { errorHandler } from '../app/middlewares/error';
import { NotFoundError } from '../shared/errors/domain';
import { logger } from '../shared/utils/logger';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '2mb' }));
  app.use(requestContext);

  app.use('/', healthRouter);
  app.use('/internal', createInternalRouter());

  app.use((req, _res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
  });

  app.use(errorHandler);
  return app;
}

export async function startApiServer(): Promise<void> {
  const env = loadEnv();
  const app = createApp();
  app.listen(env.PORT, env.HOST, () => {
    logger.info({ host: env.HOST, port: env.PORT }, 'File Service API listening');
  });
}
