/**
 * CloudWatch 검색용 구조화 로그 필드 (비밀값 제외).
 */

/** DATABASE_URL에서 host만 추출 — user/password 로그 금지 */
export function parseDbHost(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl?.trim()) return undefined;
  try {
    const normalized = databaseUrl.replace(/^postgres(ql)?:/, 'http:');
    const host = new URL(normalized).hostname;
    return host || undefined;
  } catch {
    return undefined;
  }
}

export function dbUrlMeta(databaseUrl: string | undefined): {
  dbHost?: string;
  dbUrlLength?: number;
} {
  if (!databaseUrl) return {};
  return {
    dbHost: parseDbHost(databaseUrl),
    dbUrlLength: databaseUrl.length,
  };
}

/** S3 key prefix만 (전체 key 최소화) */
export function s3KeyPrefix(key: string): string {
  const slash = key.indexOf('/');
  return slash >= 0 ? key.slice(0, slash + 1) : key;
}

/** SQS queue URL → queue name */
export function sqsQueueName(queueUrl: string | undefined): string | undefined {
  if (!queueUrl) return undefined;
  const parts = queueUrl.split('/');
  return parts[parts.length - 1] || undefined;
}

export function awsErrorCode(err: unknown): string | undefined {
  const e = err as { Code?: string; name?: string; code?: string };
  return e?.Code ?? e?.code ?? e?.name;
}
