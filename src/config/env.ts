/**
 * 모듈: 환경 변수 검증 (Zod)
 *
 * - 누락·형식 오류 시 프로세스 즉시 종료 (Fail Fast)
 * - 운영: ECS Task Role로 AWS 자격 증명, 로컬: .env
 */
import { z } from 'zod';
import 'dotenv/config';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.string().default('info'),

  /** PostgreSQL — import job / file 메타 */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL required'),
  /** BFF ↔ File Service 공유 비밀키 */
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY required'),

  AWS_REGION: z.string().default('ap-northeast-2'),
  /** LocalStack 등 — 빈 문자열은 미설정과 동일 (S3 SDK Invalid URL 방지) */
  AWS_ENDPOINT_URL: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
  AWS_ACCESS_KEY_ID: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
  AWS_SECRET_ACCESS_KEY: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),

  S3_FILE_BUCKET: z.string().min(1, 'S3_FILE_BUCKET required'),
  /** 미설정 시 enqueue 스킵(로컬), production에서는 필수 */
  SQS_IMPORT_QUEUE_URL: z.string().optional(),

  /** 압축 ZIP 최대 크기 (5 GiB) */
  MAX_ZIP_BYTES: z.coerce.number().int().positive().default(5_368_709_120),
  MAX_ZIP_DEPTH: z.coerce.number().int().positive().default(3),
  MAX_NESTED_ZIPS: z.coerce.number().int().positive().default(50),
  MAX_ZIP_ENTRIES: z.coerce.number().int().positive().default(100_000),
  /** 압축 해제 후 총량 상한 (15 GiB) */
  MAX_UNCOMPRESSED_BYTES: z.coerce.number().int().positive().default(16_106_127_360),
  MAX_ACTIVE_JOBS_PER_USER: z.coerce.number().int().positive().default(2),
  MAX_IMPORTS_PER_USER_PER_DAY: z.coerce.number().int().positive().default(10),
  /** presigned GET 만료(초) */
  PRESIGN_TTL_SEC: z.coerce.number().int().positive().default(300),
  /** staging ZIP presigned PUT 만료(초) */
  PRESIGN_UPLOAD_TTL_SEC: z.coerce.number().int().positive().default(900),

  IMPORT_WORKER_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false' && v !== '0'),
  IMPORT_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('환경 변수 검증 실패', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
