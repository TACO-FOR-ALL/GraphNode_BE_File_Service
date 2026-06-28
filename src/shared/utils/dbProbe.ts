/**
 * 기동 시 Postgres 연결 probe — DATABASE_URL 오설정 조기 탐지.
 */
import { getPrisma } from '../../infra/db/prisma';
import { logger } from './logger';
import { dbUrlMeta } from './logMeta';

export async function probeDatabaseConnection(service: 'api' | 'worker'): Promise<void> {
  const meta = dbUrlMeta(process.env.DATABASE_URL);
  const started = Date.now();
  logger.info({ event: 'fs.startup.db_probe.start', service, ...meta }, 'DB connectivity probe');

  try {
    await getPrisma().$queryRaw`SELECT 1`;
    logger.info(
      {
        event: 'fs.startup.db_probe.success',
        service,
        durationMs: Date.now() - started,
        ...meta,
      },
      'DB connectivity probe ok'
    );
  } catch (err) {
    const e = err as { message?: string; code?: string };
    logger.error(
      {
        event: 'fs.startup.db_probe.failed',
        service,
        durationMs: Date.now() - started,
        errMessage: e.message,
        prismaCode: e.code,
        ...meta,
      },
      'DB connectivity probe failed'
    );
    throw err;
  }
}
