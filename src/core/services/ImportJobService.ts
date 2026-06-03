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
import {
  ConflictError,
  ImportJobNotReadyError,
  ImportQuotaExceededError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/domain';

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
    this.assertProvider(provider);
    this.assertZipName(originalName);
    this.assertZipSize(sizeBytes);
    await this.assertQuota(userId);

    const env = loadEnv();
    const jobId = ulid();
    const stagingKey = buildStagingKey(userId, jobId);
    const ttlSec = env.PRESIGN_UPLOAD_TTL_SEC;

    await this.repo.createJob({
      id: jobId,
      userId,
      providerSlug: provider,
      stagingS3Key: stagingKey,
      originalName,
      status: 'pending_upload',
      statsJson: { expectedSizeBytes: sizeBytes },
    });

    const uploadUrl = await this.storage.getPresignedPutUrl(stagingKey, ttlSec, {
      contentType: 'application/zip',
      contentLength: sizeBytes,
    });
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

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
  }

  /** S3 staging 업로드 확인 후 worker enqueue */
  async startImport(userId: string, jobId: string): Promise<{ jobId: string; status: string }> {
    const job = await this.repo.findJob(jobId);
    if (!job || job.userId !== userId) {
      throw new NotFoundError('Import job not found');
    }
    if (job.status !== 'pending_upload') {
      throw new ConflictError(`Job cannot be started (status=${job.status})`);
    }

    const head = await this.storage.headObject(job.stagingS3Key);
    if (!head || head.contentLength <= 0) {
      throw new ValidationError('ZIP not found in staging — upload to presigned URL first');
    }

    const env = loadEnv();
    const expected = job.statsJson?.expectedSizeBytes;
    if (typeof expected === 'number' && head.contentLength !== expected) {
      throw new ValidationError(
        `Uploaded size ${head.contentLength} does not match declared size ${expected}`
      );
    }
    if (head.contentLength > env.MAX_ZIP_BYTES) {
      throw new ValidationError(`ZIP exceeds maximum size of ${env.MAX_ZIP_BYTES} bytes`);
    }

    const marked = await this.repo.markJobQueued(jobId, userId);
    if (!marked) {
      throw new ConflictError('Job is no longer awaiting upload');
    }

    await this.queue.publishImportJob({
      jobId,
      userId,
      provider: job.providerSlug,
      stagingS3Key: job.stagingS3Key,
    });

    return { jobId, status: 'queued' };
  }

  async getJob(userId: string, jobId: string): Promise<ImportJobStatusDto> {
    const job = await this.repo.findJob(jobId);
    if (!job || job.userId !== userId) {
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
      throw new ImportJobNotReadyError('Import job is not completed yet');
    }
    return this.storage.downloadJson<ImportCompleteDto>(job.resultS3Key);
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
      return {
        claim: 'in_progress',
        jobId: latest.id,
        provider: latest.providerSlug,
        resultS3Key: latest.resultS3Key!,
      };
    }

    return {
      claim: 'claimed',
      jobId: job.id,
      provider: job.providerSlug,
      resultS3Key: job.resultS3Key!,
    };
  }

  async completeFinalize(userId: string, jobId: string, conversationIds: string[]): Promise<void> {
    await this.repo.completeFinalize(jobId, userId, conversationIds);
  }

  async failFinalize(userId: string, jobId: string, error: string): Promise<void> {
    await this.repo.failFinalize(jobId, userId, error);
  }

  async cancelJob(userId: string, jobId: string): Promise<void> {
    const ok = await this.repo.cancelJob(jobId, userId);
    if (!ok) {
      throw new ConflictError('Job cannot be cancelled');
    }
  }

  private assertProvider(provider: string): void {
    if (!extractorRegistry.isEnabled(provider)) {
      extractorRegistry.get(provider);
    }
  }

  private assertZipName(originalName: string): void {
    if (!originalName.toLowerCase().endsWith('.zip')) {
      throw new ValidationError('Only .zip archives are supported');
    }
  }

  private assertZipSize(sizeBytes: number): void {
    const env = loadEnv();
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new ValidationError('sizeBytes must be a positive number');
    }
    if (sizeBytes > env.MAX_ZIP_BYTES) {
      throw new ValidationError(`ZIP exceeds maximum size of ${env.MAX_ZIP_BYTES} bytes`);
    }
  }

  private async assertQuota(userId: string): Promise<void> {
    const env = loadEnv();
    const active = await this.repo.countActiveJobs(userId);
    if (active >= env.MAX_ACTIVE_JOBS_PER_USER) {
      throw new ImportQuotaExceededError('Too many active import jobs');
    }

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const daily = await this.repo.countJobsSince(userId, since);
    if (daily >= env.MAX_IMPORTS_PER_USER_PER_DAY) {
      throw new ImportQuotaExceededError('Daily import quota exceeded');
    }
  }

  private async requireCompletedJob(userId: string, jobId: string) {
    const job = await this.repo.findJob(jobId);
    if (!job || job.userId !== userId) {
      throw new NotFoundError('Import job not found');
    }
    if (job.status !== 'completed' || !job.resultS3Key) {
      throw new ImportJobNotReadyError('Import job is not completed yet');
    }
    return job;
  }
}
