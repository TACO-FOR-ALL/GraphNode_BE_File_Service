/**
 * 모듈: S3 스토리지 경로 레지스트리
 *
 * GraphNode BE `storageConfig.ts`와 동일한 prefix 규칙을 사용합니다.
 * - import-staging: ZIP 원본 (S3 Lifecycle 7일 TTL)
 * - import-files: 영구 첨부 (presigned GET 대상)
 * - import-results: Worker가 만든 ImportCompleteDto JSON
 */

export const STORAGE_PREFIX = {
  IMPORT_STAGING: 'import-staging',
  IMPORT_FILES: 'import-files',
  IMPORT_RESULTS: 'import-results',
} as const;

/** 업로드 직후 ZIP 위치 */
export function buildStagingKey(userId: string, jobId: string): string {
  return `${STORAGE_PREFIX.IMPORT_STAGING}/${userId}/${jobId}/source.zip`;
}

/** 메시지 첨부 파일 최종 저장 경로 */
export function buildImportFileKey(userId: string, fileId: string, safeName: string): string {
  return `${STORAGE_PREFIX.IMPORT_FILES}/${userId}/${fileId}/${safeName}`;
}

/** BFF가 bulkCreate에 쓸 완료 payload */
export function buildImportResultKey(jobId: string): string {
  return `${STORAGE_PREFIX.IMPORT_RESULTS}/${jobId}/result.json`;
}

/** S3 key에 안전한 파일명 */
export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'file';
  return base.slice(0, 200);
}
