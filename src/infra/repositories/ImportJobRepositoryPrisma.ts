import type { Prisma } from '@prisma/client';

import type { ImportJobRepository, ImportJobRecord, ImportedFileRecord } from '../../core/ports/ImportJobRepository';
import type { ImportFinalizeStatus, ImportJobStatusDto } from '../../shared/dtos/import';
import { NotFoundError } from '../../shared/errors/domain';
import { getPrisma } from '../db/prisma';

function mapJob(row: {
  id: string;
  userId: string;
  providerSlug: string;
  status: string;
  stagingS3Key: string;
  originalName: string | null;
  progress: number;
  resultS3Key: string | null;
  statsJson: Prisma.JsonValue;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: Date;
  completedAt: Date | null;
  finalizeStatus: string;
  finalizeStartedAt: Date | null;
  finalizedAt: Date | null;
  finalizeError: string | null;
  finalizeConversationIds: Prisma.JsonValue;
}): ImportJobRecord {
  const conversationIds = row.finalizeConversationIds;
  return {
    id: row.id,
    userId: row.userId,
    providerSlug: row.providerSlug,
    status: row.status,
    stagingS3Key: row.stagingS3Key,
    originalName: row.originalName,
    progress: row.progress,
    resultS3Key: row.resultS3Key,
    statsJson: (row.statsJson as Record<string, unknown>) ?? null,
    errorCode: row.errorCode,
    errorDetail: row.errorDetail,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    finalizeStatus: row.finalizeStatus as ImportFinalizeStatus,
    finalizeStartedAt: row.finalizeStartedAt,
    finalizedAt: row.finalizedAt,
    finalizeError: row.finalizeError,
    finalizeConversationIds: Array.isArray(conversationIds)
      ? (conversationIds as string[])
      : null,
  };
}

export class ImportJobRepositoryPrisma implements ImportJobRepository {
  private db = getPrisma();

  async countActiveJobs(userId: string): Promise<number> {
    return this.db.importJob.count({
      where: {
        userId,
        status: { in: ['pending_upload', 'pending', 'queued', 'processing'] },
      },
    });
  }

  async countJobsSince(userId: string, since: Date): Promise<number> {
    return this.db.importJob.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  async createJob(input: {
    id: string;
    userId: string;
    providerSlug: string;
    stagingS3Key: string;
    originalName?: string;
    zipSha256?: string;
    status?: string;
    statsJson?: Record<string, unknown>;
  }): Promise<ImportJobRecord> {
    const row = await this.db.importJob.create({
      data: {
        id: input.id,
        userId: input.userId,
        providerSlug: input.providerSlug,
        status: input.status ?? 'queued',
        stagingS3Key: input.stagingS3Key,
        originalName: input.originalName,
        zipSha256: input.zipSha256,
        statsJson: input.statsJson as Prisma.InputJsonValue | undefined,
        progress: 0,
      },
    });
    return mapJob(row);
  }

  async markJobQueued(jobId: string, userId: string): Promise<boolean> {
    const updated = await this.db.importJob.updateMany({
      where: { id: jobId, userId, status: 'pending_upload' },
      data: { status: 'queued' },
    });
    return updated.count > 0;
  }

  async findJob(jobId: string): Promise<ImportJobRecord | null> {
    const row = await this.db.importJob.findUnique({ where: { id: jobId } });
    return row ? mapJob(row) : null;
  }

  async tryMarkProcessing(jobId: string, workerId: string): Promise<boolean> {
    const updated = await this.db.importJob.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'processing', workerId, startedAt: new Date(), attempt: { increment: 1 } },
    });
    return updated.count > 0;
  }

  async updateProgress(jobId: string, progress: number): Promise<void> {
    await this.db.importJob.update({ where: { id: jobId }, data: { progress } });
  }

  async completeJob(jobId: string, stats: Record<string, unknown>, resultS3Key: string): Promise<void> {
    await this.db.importJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        progress: 100,
        statsJson: stats as Prisma.InputJsonValue,
        resultS3Key,
        completedAt: new Date(),
      },
    });
  }

  async failJob(jobId: string, errorCode: string, errorDetail: string): Promise<void> {
    await this.db.importJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorCode, errorDetail, completedAt: new Date() },
    });
  }

  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    const updated = await this.db.importJob.updateMany({
      where: { id: jobId, userId, status: { in: ['queued', 'pending_upload'] } },
      data: { status: 'cancelled', completedAt: new Date() },
    });
    return updated.count > 0;
  }

  async tryClaimFinalize(jobId: string, userId: string): Promise<boolean> {
    const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
    const updated = await this.db.importJob.updateMany({
      where: {
        id: jobId,
        userId,
        status: 'completed',
        OR: [
          { finalizeStatus: { in: ['none', 'failed'] } },
          {
            finalizeStatus: 'finalizing',
            finalizeStartedAt: { lt: staleBefore },
          },
        ],
      },
      data: {
        finalizeStatus: 'finalizing',
        finalizeStartedAt: new Date(),
        finalizeError: null,
      },
    });
    return updated.count > 0;
  }

  async completeFinalize(jobId: string, userId: string, conversationIds: string[]): Promise<void> {
    await this.db.importJob.updateMany({
      where: { id: jobId, userId, finalizeStatus: 'finalizing' },
      data: {
        finalizeStatus: 'finalized',
        finalizedAt: new Date(),
        finalizeConversationIds: conversationIds as Prisma.InputJsonValue,
        finalizeError: null,
      },
    });
  }

  async failFinalize(jobId: string, userId: string, error: string): Promise<void> {
    await this.db.importJob.updateMany({
      where: { id: jobId, userId, finalizeStatus: 'finalizing' },
      data: {
        finalizeStatus: 'failed',
        finalizeError: error.slice(0, 2000),
      },
    });
  }

  async createImportedFile(
    input: Omit<ImportedFileRecord, 'status'> & { status?: string; providerSlug: string }
  ): Promise<ImportedFileRecord> {
    const row = await this.db.importedFile.create({
      data: {
        id: input.id,
        jobId: input.jobId,
        userId: input.userId,
        providerSlug: input.providerSlug,
        providerFileId: input.providerFileId,
        relativePath: input.relativePath,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        s3Key: input.s3Key,
        status: input.status ?? 'discovered',
      },
    });
    return {
      id: row.id,
      jobId: row.jobId,
      userId: row.userId,
      providerFileId: row.providerFileId,
      relativePath: row.relativePath,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      s3Key: row.s3Key,
      status: row.status,
    };
  }

  async updateFileS3Key(fileId: string, s3Key: string, status: string): Promise<void> {
    await this.db.importedFile.update({ where: { id: fileId }, data: { s3Key, status } });
  }

  async findFileById(fileId: string): Promise<ImportedFileRecord | null> {
    const row = await this.db.importedFile.findUnique({ where: { id: fileId } });
    if (!row) return null;
    return {
      id: row.id,
      jobId: row.jobId,
      userId: row.userId,
      providerFileId: row.providerFileId,
      relativePath: row.relativePath,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      s3Key: row.s3Key,
      status: row.status,
    };
  }

  async listFilesByJob(jobId: string): Promise<ImportedFileRecord[]> {
    const rows = await this.db.importedFile.findMany({ where: { jobId } });
    return rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      userId: row.userId,
      providerFileId: row.providerFileId,
      relativePath: row.relativePath,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      s3Key: row.s3Key,
      status: row.status,
    }));
  }

  async createMessageLink(input: {
    jobId: string;
    providerConversationKey?: string;
    providerMessageKey: string;
    graphMessageId?: string;
    importedFileId: string;
    confidence: string;
  }): Promise<void> {
    await this.db.messageFileLink.create({
      data: {
        jobId: input.jobId,
        providerConversationKey: input.providerConversationKey,
        providerMessageKey: input.providerMessageKey,
        graphMessageId: input.graphMessageId,
        importedFileId: input.importedFileId,
        confidence: input.confidence,
      },
    });
  }

  toStatusDto(job: ImportJobRecord): ImportJobStatusDto {
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      stats: job.statsJson ?? undefined,
      error:
        job.errorCode != null
          ? { code: job.errorCode, detail: job.errorDetail ?? undefined }
          : undefined,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      finalizeStatus: job.finalizeStatus,
      finalizedAt: job.finalizedAt?.toISOString(),
      finalizeConversationIds: job.finalizeConversationIds ?? undefined,
      finalizeError: job.finalizeError ?? undefined,
    };
  }
}

export async function assertJobOwned(jobId: string, userId: string): Promise<ImportJobRecord> {
  const repo = new ImportJobRepositoryPrisma();
  const job = await repo.findJob(jobId);
  if (!job || job.userId !== userId) {
    throw new NotFoundError('Import job not found');
  }
  return job;
}
