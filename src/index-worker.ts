/**
 * 진입점: Import SQS Worker
 */
import { loadEnv } from './config/env';
import { requireQueueInProduction } from './infra/aws/SqsPublisher';
import { startImportQueueConsumer } from './workers/ImportQueueConsumer';
import { probeDatabaseConnection } from './shared/utils/dbProbe';
import { sqsQueueName } from './shared/utils/logMeta';
import { logger } from './shared/utils/logger';

async function main(): Promise<void> {
  const env = loadEnv();
  requireQueueInProduction();
  await probeDatabaseConnection('worker');

  const consumer = startImportQueueConsumer();
  if (!consumer) {
    logger.error({ event: 'fs.worker.startup.failed' }, 'SQS_IMPORT_QUEUE_URL not set — worker cannot start');
    process.exit(1);
  }

  logger.info(
    {
      event: 'fs.worker.startup.ready',
      service: 'file-service-worker',
      nodeEnv: env.NODE_ENV,
      sqsQueue: sqsQueueName(env.SQS_IMPORT_QUEUE_URL),
    },
    'File Service worker ready'
  );

  process.on('SIGTERM', () => {
    consumer.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ event: 'fs.worker.startup.failed', err }, 'File Service worker startup failed');
  process.exit(1);
});
