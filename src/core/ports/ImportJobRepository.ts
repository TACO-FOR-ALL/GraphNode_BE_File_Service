import type { ImportFinalizeStatus, ImportJobStatusDto } from '../../shared/dtos/import';

export type { ImportFinalizeStatus };

export interface ImportJobRecord {
  id: string;
  userId: string;
  providerSlug: string;
  status: string;
  stagingS3Key: string;
  originalName: string | null;
  progress: number;
  resultS3Key: string | null;
  statsJson: Record<string, unknown> | null;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: Date;
  completedAt: Date | null;
  finalizeStatus: ImportFinalizeStatus;
  finalizeStartedAt: Date | null;
  finalizedAt: Date | null;
  finalizeError: string | null;
  finalizeConversationIds: string[] | null;
}

export interface ImportedFileRecord {
  id: string;
  jobId: string;
  userId: string;
  providerFileId: string | null;
  relativePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint;
  sha256: string;
  s3Key: string | null;
  status: string;
}

export interface ImportJobRepository {
  countActiveJobs(userId: string): Promise<number>;
  countJobsSince(userId: string, since: Date): Promise<number>;
  createJob(input: {
    id: string;
    userId: string;
    providerSlug: string;
    stagingS3Key: string;
    originalName?: string;
    zipSha256?: string;
    status?: string;
    statsJson?: Record<string, unknown>;
  }): Promise<ImportJobRecord>;

  markJobQueued(jobId: string, userId: string): Promise<boolean>;

  findJob(jobId: string): Promise<ImportJobRecord | null>;
  tryMarkProcessing(jobId: string, workerId: string): Promise<boolean>;
  updateProgress(jobId: string, progress: number): Promise<void>;
  completeJob(jobId: string, stats: Record<string, unknown>, resultS3Key: string): Promise<void>;
  failJob(jobId: string, errorCode: string, errorDetail: string): Promise<void>;
  cancelJob(jobId: string, userId: string): Promise<boolean>;

  tryClaimFinalize(jobId: string, userId: string): Promise<boolean>;
  completeFinalize(jobId: string, userId: string, conversationIds: string[]): Promise<void>;
  failFinalize(jobId: string, userId: string, error: string): Promise<void>;

  createImportedFile(
    input: Omit<ImportedFileRecord, 'status'> & { status?: string; providerSlug: string }
  ): Promise<ImportedFileRecord>;
  updateFileS3Key(fileId: string, s3Key: string, status: string): Promise<void>;
  findFileById(fileId: string): Promise<ImportedFileRecord | null>;
  listFilesByJob(jobId: string): Promise<ImportedFileRecord[]>;

  createMessageLink(input: {
    jobId: string;
    providerConversationKey?: string;
    providerMessageKey: string;
    graphMessageId?: string;
    importedFileId: string;
    confidence: string;
  }): Promise<void>;

  toStatusDto(job: ImportJobRecord): ImportJobStatusDto;
}
