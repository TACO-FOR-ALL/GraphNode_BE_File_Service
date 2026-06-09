import { AppError } from '../errors/base';
import { InvalidArchiveError } from '../errors/domain';

export type ImportProcessingStage =
  | 'acquire_job'
  | 'download_zip'
  | 'extract_archive'
  | 'parse_shards'
  | 'persist_files'
  | 'upload_result'
  | 'complete_job';

const STAGE_DEFAULT_CODE: Record<ImportProcessingStage, string> = {
  acquire_job: 'IMPORT_JOB_LOCK_FAILED',
  download_zip: 'IMPORT_DOWNLOAD_FAILED',
  extract_archive: 'IMPORT_EXTRACT_FAILED',
  parse_shards: 'IMPORT_PARSE_FAILED',
  persist_files: 'IMPORT_PERSIST_FILES_FAILED',
  upload_result: 'IMPORT_RESULT_UPLOAD_FAILED',
  complete_job: 'IMPORT_COMPLETE_FAILED',
};

/**
 * Import worker 실패 시 job.errorCode / errorDetail에 기록할 code·detail을 반환합니다.
 */
export function classifyImportProcessingError(
  err: unknown,
  stage: ImportProcessingStage
): { code: string; detail: string } {
  if (err instanceof AppError) {
    return {
      code: err.code,
      detail: err.message,
    };
  }

  if (err instanceof InvalidArchiveError) {
    return { code: 'INVALID_ARCHIVE', detail: err.message };
  }

  const mongoCode = (err as { code?: number })?.code;
  const detail =
    err instanceof Error ? err.message : String(err);

  const code =
    mongoCode === 11000
      ? 'IMPORT_DUPLICATE_KEY'
      : STAGE_DEFAULT_CODE[stage] ?? 'IMPORT_FAILED';

  return { code, detail: `[${stage}] ${detail}` };
}
