/**
 * 진입점: Import SQS Worker
 *
 * - HTTP 포트 없음 (GraphNode BE graph worker와 동일 패턴)
 * - ZIP 해제·파싱·S3 업로드·결과 JSON 저장은 여기서 처리
 */
import { loadEnv } from './config/env';
import { requireQueueInProduction } from './infra/aws/SqsPublisher';
import { startImportQueueConsumer } from './workers/ImportQueueConsumer';
import { logger } from './shared/utils/logger';

loadEnv();
requireQueueInProduction();

const consumer = startImportQueueConsumer();
if (!consumer) {
  logger.error('SQS_IMPORT_QUEUE_URL not set — worker cannot start');
  process.exit(1);
}

process.on('SIGTERM', () => {
  consumer?.stop();
  process.exit(0);
});
