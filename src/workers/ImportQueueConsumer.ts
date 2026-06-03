/**
 * 모듈: ImportQueueConsumer
 *
 * SQS에서 import job 메시지를 폴링해 ImportProcessingService.processMessage 실행.
 * GraphNode BE graph result worker(sqs-consumer)와 동일 패턴.
 */
import { Consumer } from 'sqs-consumer';
import { SQSClient } from '@aws-sdk/client-sqs';
import { hostname } from 'os';

import { getContainer } from '../bootstrap/container';
import { loadEnv } from '../config/env';
import type { ImportJobMessage } from '../shared/dtos/import';
import { logger } from '../shared/utils/logger';

export function startImportQueueConsumer(): Consumer | null {
  const env = loadEnv();
  if (!env.SQS_IMPORT_QUEUE_URL) {
    logger.warn('SQS_IMPORT_QUEUE_URL 미설정 — import worker idle');
    return null;
  }

  const container = getContainer();
  const workerId = `${hostname()}-${process.pid}`;

  const app = Consumer.create({
    queueUrl: env.SQS_IMPORT_QUEUE_URL,
    sqs: new SQSClient({
      region: env.AWS_REGION,
      ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
          : undefined,
    }),
    handleMessage: async (message) => {
      if (!message.Body) return message;
      const body = JSON.parse(message.Body) as ImportJobMessage;
      await container.importProcessingService.processMessage(body, workerId);
      return message;
    },
  });

  app.on('error', (err) => logger.error({ err }, 'Import SQS consumer error'));
  app.on('processing_error', (err) => logger.error({ err }, 'Import message processing error'));

  app.start();
  logger.info({ queueUrl: env.SQS_IMPORT_QUEUE_URL, workerId }, 'Import queue consumer started');
  return app;
}
