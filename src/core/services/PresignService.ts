/**
 * 모듈: PresignService
 *
 * 책임: 채팅 UI에서 첨부 파일을 열 때 쓸 S3 presigned GET URL 발급.
 */
import { loadEnv } from '../../config/env';
import type { ImportJobRepository } from '../ports/ImportJobRepository';
import type { StoragePort } from '../ports/StoragePort';
import type { PresignedAccessResponse } from '../../shared/dtos/import';
import { getCorrelationId } from '../../shared/context/requestStore';
import { NotFoundError } from '../../shared/errors/domain';
import { awsErrorCode, s3KeyPrefix } from '../../shared/utils/logMeta';
import { buildContentDisposition } from '../../shared/utils/contentDisposition';
import { logger } from '../../shared/utils/logger';

export class PresignService {
  constructor(
    private readonly repo: ImportJobRepository,
    private readonly storage: StoragePort
  ) {}

  async presignFileAccess(
    userId: string,
    fileId: string,
    opts?: { disposition?: 'inline' | 'attachment' }
  ): Promise<PresignedAccessResponse> {
    const correlationId = getCorrelationId();
    const started = Date.now();
    logger.info(
      {
        event: 'fs.presign.get.start',
        correlationId,
        userId,
        fileId,
        disposition: opts?.disposition,
      },
      'Presign file access requested'
    );

    const file = await this.repo.findFileById(fileId);
    if (!file || file.userId !== userId) {
      logger.warn(
        { event: 'fs.presign.get.file_not_found', correlationId, userId, fileId },
        'Imported file not found'
      );
      throw new NotFoundError('File not found');
    }
    if (!file.s3Key) {
      logger.warn(
        { event: 'fs.presign.get.file_no_s3_key', correlationId, userId, fileId, jobId: file.jobId },
        'Imported file has no S3 key'
      );
      throw new NotFoundError('File is not uploaded yet');
    }

    const env = loadEnv();
    const expiresSec = env.PRESIGN_TTL_SEC;
    const disposition =
      opts?.disposition === 'attachment' || opts?.disposition === 'inline'
        ? buildContentDisposition(file.originalName, opts.disposition)
        : undefined;

    try {
      const url = await this.storage.getPresignedGetUrl(file.s3Key, expiresSec, { disposition });
      const expiresAt = new Date(Date.now() + expiresSec * 1000).toISOString();

      logger.info(
        {
          event: 'fs.presign.get.success',
          correlationId,
          userId,
          fileId,
          mimeType: file.mimeType,
          s3KeyPrefix: s3KeyPrefix(file.s3Key),
          durationMs: Date.now() - started,
        },
        'Presign file access issued'
      );

      return {
        url,
        expiresAt,
        fileId: file.id,
        mimeType: file.mimeType,
        name: file.originalName,
      };
    } catch (err) {
      logger.error(
        {
          event: 'fs.presign.get.s3_sign.failed',
          correlationId,
          userId,
          fileId,
          s3KeyPrefix: s3KeyPrefix(file.s3Key),
          awsErrorCode: awsErrorCode(err),
          errMessage: (err as Error).message,
          durationMs: Date.now() - started,
        },
        'Presign GET URL generation failed'
      );
      throw err;
    }
  }
}
