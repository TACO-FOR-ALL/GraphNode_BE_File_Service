/**
 * 모듈: ImportJobService
 *
 * presigned PUT init → FE S3 업로드 → start → SQS enqueue.
 * ZIP 처리는 ImportProcessingService(Worker).
 */
import { ulid } from 'ulid';

import { buildStagingKey } from '../../config/storageConfig';
import { loadEnv } from '../../config/env';
import { extractorRegistry } from '../extractors/ExtractorRegistry';
import type { ImportJobRepository } from '../ports/ImportJobRepository';
import type { QueuePort } from '../ports/QueuePort';
import type { StoragePort } from '../ports/StoragePort';
import type { ImportCompleteDto, ImportJobStatusDto, ImportUploadInitDto } from '../../shared/dtos/import';
import type {
  ImportFinalizeClaimDto,
  ImportResultRefDto,
} from '../../shared/dtos/import';
import { getCorrelationId } from '../../shared/context/requestStore';
import {
  AppError,
  ConflictError,
  ImportJobNotReadyError,
  ImportQuotaExceededError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/domain';
import { awsErrorCode, s3KeyPrefix } from '../../shared/utils/logMeta';
import { logger } from '../../shared/utils/logger';

function logCtx(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const correlationId = getCorrelationId();
  return correlationId ? { correlationId, ...extra } : extra;
}

function logImportWarn(
  event: string,
  msg: string,
  extra: Record<string, unknown> = {}
): void {
  logger.warn({ event, ...logCtx(extra) }, msg);
}

function logImportError(
  event: string,
  msg: string,
  extra: Record<string, unknown> = {}
): void {
  logger.error({ event, ...logCtx(extra) }, msg);
}

export class ImportJobService {
  constructor(
    private readonly repo: ImportJobRepository,
    private readonly storage: StoragePort,
    private readonly queue: QueuePort
  ) {}

  listProviders() {
    return extractorRegistry.listProviders();
  }

  /** FE → S3 직접 업로드: presigned PUT URL 발급 */
  async initUpload(
    userId: string,
    provider: string,
    originalName: string,
    sizeBytes: number
  ): Promise<ImportUploadInitDto> {
    const started = Date.now();
    logger.info(
      {
        event: 'fs.import.init.start',
        ...logCtx({ userId, provider, originalName, sizeBytes }),
      },
      'Import upload init started'
    );

    try {
      this.assertProvider(provider);
      this.assertZipName(originalName);
      this.assertZipSize(sizeBytes);
      await this.assertQuota(userId);

      const env = loadEnv();
      const jobId = ulid();
      const stagingKey = buildStagingKey(userId, jobId);
      const ttlSec = env.PRESIGN_UPLOAD_TTL_SEC;

      try {
        await this.repo.createJob({
          id: jobId,
          userId,
          providerSlug: provider,
          stagingS3Key: stagingKey,
          originalName,
          status: 'pending_upload',
          statsJson: { expectedSizeBytes: sizeBytes },
        });
      } catch (err) {
        const e = err as { message?: string; code?: string };
        logImportError('fs.import.init.db_create.failed', 'Import job DB create failed', {
          userId,
          jobId,
          errMessage: e.message,
          prismaCode: e.code,
          durationMs: Date.now() - started,
        });
        throw err;
      }

      let uploadUrl: string;
      try {
        uploadUrl = await this.storage.getPresignedPutUrl(stagingKey, ttlSec, {
          contentType: 'application/zip',
          contentLength: sizeBytes,
        });
      } catch (err) {
        logImportError('fs.import.init.s3_presign_put.failed', 'Staging presigned PUT failed', {
          userId,
          jobId,
          stagingKeyPrefix: s3KeyPrefix(stagingKey),
          awsErrorCode: awsErrorCode(err),
          errMessage: (err as Error).message,
          durationMs: Date.now() - started,
        });
        throw err;
      }

      const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

      logger.info(
        {
          event: 'fs.import.init.success',
          ...logCtx({
            userId,
            jobId,
            stagingKeyPrefix: s3KeyPrefix(stagingKey),
            durationMs: Date.now() - started,
          }),
        },
        'Import upload init completed'
      );

      return {
        jobId,
        status: 'pending_upload',
        uploadUrl,
        uploadHeaders: {
          'Content-Type': 'application/zip',
          'Content-Length': String(sizeBytes),
        },
        expiresAt,
        stagingKey,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logImportError('fs.import.init.failed', 'Import upload init failed', {
        userId,
        provider,
        errMessage: (err as Error).message,
        durationMs: Date.now() - started,
      });
      throw err;
    }
  }

  /** S3 staging 업로드 확인 후 worker enqueue */
  async startImport(userId: string, jobId: string): Promise<{ jobId: string; status: string }> {
    const started = Date.now();
    logger.info(
      { event: 'fs.import.start.begin', ...logCtx({ userId, jobId }) },
      'Import start requested'
    );

    const job = await this.repo.findJob(jobId);
    if (!job || job.userId !== userId) {
      logImportWarn('fs.import.start.job_not_found', 'Import job not found', { userId, jobId });
      throw new NotFoundError('Import job not found');
    }
    if (job.status !== 'pending_upload') {
      logImportWarn('fs.import.start.status_conflict', 'Import job cannot be started', {
        userId,
        jobId,
        status: job.status,
      });
      throw new ConflictError(`Job cannot be started (status=${job.status})`);
    }

    const head = await this.storage.headObject(job.stagingS3Key);
    if (!head || head.contentLength <= 0) {
      logImportWarn('fs.import.start.staging_missing', 'Staging ZIP not found in S3', {
        userId,
        jobId,
        stagingKeyPrefix: s3KeyPrefix(job.stagingS3Key),
      });
      throw new ValidationError('ZIP not found in staging — upload to presigned URL first');
    }

    const env = loadEnv();
    const expected = job.statsJson?.expectedSizeBytes;
    if (typeof expected === 'number' && head.contentLength !== expected) {
      logImportWarn('fs.import.start.size_mismatch', 'Uploaded ZIP size mismatch', {
        userId,
        jobId,
        expectedSize: expected,
        actualSize: head.contentLength,
      });
      throw new ValidationError(
        `Uploaded size ${head.contentLength} does not match declared size ${expected}`
      );
    }
    if (head.contentLength > env.MAX_ZIP_BYTES) {
      logImportWarn('fs.import.start.zip_too_large', 'ZIP exceeds maximum size', {
        userId,
        jobId,
        actualSize: head.contentLength,
        maxBytes: env.MAX_ZIP_BYTES,
      });
      throw new ValidationError(`ZIP exceeds maximum size of ${env.MAX_ZIP_BYTES} bytes`);
    }

    const marked = await this.repo.markJobQueued(jobId, userId);
    if (!marked) {
      logImportWarn('fs.import.start.mark_queued_conflict', 'Job no longer awaiting upload', {
        userId,
        jobId,
      });
      throw new ConflictError('Job is no longer awaiting upload');
    }

    try {
      await this.queue.publishImportJob({
        jobId,
        userId,
        provider: job.providerSlug,
        stagingS3Key: job.stagingS3Key,
      });
    } catch (err) {
      logImportError('fs.import.start.sqs_enqueue.failed', 'SQS enqueue failed', {
        userId,
        jobId,
        errMessage: (err as Error).message,
        awsErrorCode: awsErrorCode(err),
        durationMs: Date.now() - started,
      });
      throw err;
    }

    logger.info(
      {
        event: 'fs.import.start.success',
        ...logCtx({ userId, jobId, durationMs: Date.now() - started }),
      },
      'Import start completed'
    );

    return { jobId, status: 'queued' };
  }

  async getJob(userId: string, jobId: string): Promise<ImportJobStatusDto> {
    const job = await this.repo.findJob(jobId);
    if (!job || job.userId !== userId) {
      logImportWarn('fs.import.job.get.not_found', 'Import job not found', { userId, jobId });
      throw new NotFoundError('Import job not found');
    }
    return this.repo.toStatusDto(job);
  }

  async getResult(userId: string, jobId: string): Promise<ImportCompleteDto> {
    const job = await this.repo.findJob(jobId);
    if (!job || job.userId !== userId) {
      throw new NotFoundError('Import job not found');
    }
    if (job.status !== 'completed' || !job.resultS3Key) {
      logImportWarn('fs.import.result.get.not_ready', 'Import job not completed', {
        userId,
        jobId,
        status: job.status,
      });
      throw new ImportJobNotReadyError('Import job is not completed yet');
    }
    try {
      return await this.storage.downloadJson<ImportCompleteDto>(job.resultS3Key);
    } catch (err) {
      logImportError('fs.import.result.get.s3_download.failed', 'Result JSON download failed', {
        userId,
        jobId,
        resultKeyPrefix: s3KeyPrefix(job.resultS3Key),
        errMessage: (err as Error).message,
      });
      throw err;
    }
  }

  /** S3 key만 반환 — result JSON HTTP body 전송 없음 */
  async getResultRef(userId: string, jobId: string): Promise<ImportResultRefDto> {
    const job = await this.requireCompletedJob(userId, jobId);
    return {
      jobId: job.id,
      userId: job.userId,
      provider: job.providerSlug,
      resultS3Key: job.resultS3Key!,
      stats: job.statsJson ?? undefined,
    };
  }

  /**
   * finalize 멱등 claim.
   * - finalized → already_finalized
   * - finalizing (30분 이내) → in_progress
   * - none/failed/stale finalizing → claimed (CAS)
   */
  async claimFinalize(userId: string, jobId: string): Promise<ImportFinalizeClaimDto> {
    const job = await this.requireCompletedJob(userId, jobId);

    if (job.finalizeStatus === 'finalized') {
      logger.info(
        { event: 'fs.import.finalize.claim.already_finalized', ...logCtx({ userId, jobId }) },
        'Finalize already completed'
      );
      return {
        claim: 'already_finalized',
        jobId: job.id,
        provider: job.providerSlug,
        resultS3Key: job.resultS3Key!,
        conversationIds: job.finalizeConversationIds ?? [],
      };
    }

    if (job.finalizeStatus === 'finalizing') {
      const staleMs = 30 * 60 * 1000;
      const started = job.finalizeStartedAt?.getTime() ?? 0;
      if (Date.now() - started < staleMs) {
        logger.info(
          { event: 'fs.import.finalize.claim.in_progress', ...logCtx({ userId, jobId }) },
          'Finalize already in progress'
        );
        return {
          claim: 'in_progress',
          jobId: job.id,
          provider: job.providerSlug,
          resultS3Key: job.resultS3Key!,
        };
      }
    }

    const claimed = await this.repo.tryClaimFinalize(jobId, userId);
    if (!claimed) {
      const latest = await this.requireCompletedJob(userId, jobId);
      if (latest.finalizeStatus === 'finalized') {
        return {
          claim: 'already_finalized',
          jobId: latest.id,
          provider: latest.providerSlug,
          resultS3Key: latest.resultS3Key!,
          conversationIds: latest.finalizeConversationIds ?? [],
        };
      }
      logger.info(
        { event: 'fs.import.finalize.claim.in_progress', ...logCtx({ userId, jobId }) },
        'Finalize claim lost race'
      );
      return {
        claim: 'in_progress',
        jobId: latest.id,
        provider: latest.providerSlug,
        resultS3Key: latest.resultS3Key!,
      };
    }

    logger.info(
      { event: 'fs.import.finalize.claim.claimed', ...logCtx({ userId, jobId }) },
      'Finalize claim acquired'
    );

    return {
      claim: 'claimed',
      jobId: job.id,
      provider: job.providerSlug,
      resultS3Key: job.resultS3Key!,
    };
  }

  async completeFinalize(userId: string, jobId: string, conversationIds: string[]): Promise<void> {
    try {
      await this.repo.completeFinalize(jobId, userId, conversationIds);
      logger.info(
        {
          event: 'fs.import.finalize.complete.success',
          ...logCtx({ userId, jobId, conversationCount: conversationIds.length }),
        },
        'Finalize marked complete'
      );
    } catch (err) {
      logImportError('fs.import.finalize.complete.failed', 'Finalize complete failed', {
        userId,
        jobId,
        errMessage: (err as Error).message,
      });
      throw err;
    }
  }

  async failFinalize(userId: string, jobId: string, error: string): Promise<void> {
    await this.repo.failFinalize(jobId, userId, error);
    logger.warn(
      { event: 'fs.import.finalize.fail.recorded', ...logCtx({ userId, jobId, error }) },
      'Finalize failure recorded'
    );
  }

  async cancelJob(userId: string, jobId: string): Promise<void> {
    const ok = await this.repo.cancelJob(jobId, userId);
    if (!ok) {
      logImportWarn('fs.import.cancel.conflict', 'Import job cannot be cancelled', { userId, jobId });
      throw new ConflictError('Job cannot be cancelled');
    }
    logger.info({ event: 'fs.import.cancel.success', ...logCtx({ userId, jobId }) }, 'Import job cancelled');
  }

  private assertProvider(provider: string): void {
    if (!extractorRegistry.isEnabled(provider)) {
      try {
        extractorRegistry.get(provider);
      } catch (err) {
        logImportWarn('fs.import.init.provider_invalid', 'Invalid import provider', {
          provider,
          errMessage: (err as Error).message,
        });
        throw err;
      }
    }
  }

  private assertZipName(originalName: string): void {
    if (!originalName.toLowerCase().endsWith('.zip')) {
      logImportWarn('fs.import.init.zip_name_invalid', 'Only .zip archives supported', {
        originalName,
      });
      throw new ValidationError('Only .zip archives are supported');
    }
  }

  private assertZipSize(sizeBytes: number): void {
    const env = loadEnv();
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      logImportWarn('fs.import.init.size_invalid', 'sizeBytes must be positive', { sizeBytes });
      throw new ValidationError('sizeBytes must be a positive number');
    }
    if (sizeBytes > env.MAX_ZIP_BYTES) {
      logImportWarn('fs.import.init.size_exceeded', 'ZIP exceeds maximum size', {
        sizeBytes,
        maxBytes: env.MAX_ZIP_BYTES,
      });
      throw new ValidationError(`ZIP exceeds maximum size of ${env.MAX_ZIP_BYTES} bytes`);
    }
  }

  private async assertQuota(userId: string): Promise<void> {
    const env = loadEnv();
    const active = await this.repo.countActiveJobs(userId);
    if (active >= env.MAX_ACTIVE_JOBS_PER_USER) {
      logImportWarn('fs.import.init.quota_active', 'Too many active import jobs', {
        userId,
        activeJobs: active,
        maxActive: env.MAX_ACTIVE_JOBS_PER_USER,
      });
      throw new ImportQuotaExceededError('Too many active import jobs');
    }

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const daily = await this.repo.countJobsSince(userId, since);
    if (daily >= env.MAX_IMPORTS_PER_USER_PER_DAY) {
      logImportWarn('fs.import.init.quota_daily', 'Daily import quota exceeded', {
        userId,
        dailyJobs: daily,
        maxDaily: env.MAX_IMPORTS_PER_USER_PER_DAY,
      });
      throw new ImportQuotaExceededError('Daily import quota exceeded');
    }
  }

  private async requireCompletedJob(userId: string, jobId: string) {
    const job = await this.repo.findJob(jobId);
    if (!job || job.userId !== userId) {
      throw new NotFoundError('Import job not found');
    }
    if (job.status !== 'completed' || !job.resultS3Key) {
      logImportWarn('fs.import.finalize.claim.not_ready', 'Import job not ready for finalize', {
        userId,
        jobId,
        status: job.status,
      });
      throw new ImportJobNotReadyError('Import job is not completed yet');
    }
    return job;
  }
}
