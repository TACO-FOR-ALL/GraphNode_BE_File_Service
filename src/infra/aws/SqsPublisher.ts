/**
 * 모듈: SqsPublisher
 *
 * import job 생성 후 Worker에 처리를 위임하기 위해 SQS에 메시지 publish.
 * 로컬에서 SQS URL 없으면 skip (개발용).
 */
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

import { loadEnv } from '../../config/env';
import { QueuePort } from '../../core/ports/QueuePort';
import type { ImportJobMessage } from '../../shared/dtos/import';
import { UpstreamError, ValidationError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

export class SqsPublisher implements QueuePort {
  private readonly client: SQSClient;
  private readonly queueUrl: string | undefined;

  constructor() {
    const env = loadEnv();
    this.queueUrl = env.SQS_IMPORT_QUEUE_URL;
    this.client = new SQSClient({
      region: env.AWS_REGION,
      ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async publishImportJob(message: ImportJobMessage): Promise<void> {
    if (!this.queueUrl) {
      logger.warn({ jobId: message.jobId }, 'SQS_IMPORT_QUEUE_URL not set — skipping enqueue (dev mode)');
      return;
    }
    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(message),
        })
      );
    } catch (error) {
      throw new UpstreamError('Failed to enqueue import job', { originalError: String(error) });
    }
  }
}

/** Dev: process inline when queue URL missing */
export function requireQueueInProduction(): void {
  const env = loadEnv();
  if (env.NODE_ENV === 'production' && !env.SQS_IMPORT_QUEUE_URL) {
    throw new ValidationError('SQS_IMPORT_QUEUE_URL is required in production');
  }
}
