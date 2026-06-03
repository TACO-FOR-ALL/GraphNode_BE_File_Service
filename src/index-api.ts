/**
 * 진입점: File Service HTTP API
 *
 * - 포트 기본 3001 (GraphNode BFF와 분리)
 * - 공인 ALB에 직접 노출하지 않고, BFF가 VPC 내부에서 /internal/* 호출
 */
import { startApiServer } from './bootstrap/server';
import { loadEnv } from './config/env';
import { logger } from './shared/utils/logger';

loadEnv();
startApiServer().catch((err) => {
  logger.error({ err }, 'File Service API 기동 실패');
  process.exit(1);
});
