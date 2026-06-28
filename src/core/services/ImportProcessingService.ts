/**
 * 모듈: ImportProcessingService (SQS Worker 핵심 로직)
 *
 * 파이프라인:
 * 1. staging ZIP 다운로드 → extractor 재귀 해제
 * 2. buildFileIndex + shard 목록
 * 3. shard별 parse → threads/refs 누적 (JSON 합치지 않음)
 * 4. S3 업로드 + message_file_links
 * 5. ImportCompleteDto → S3 → job completed
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ulid } from 'ulid';

import { buildImportFileKey, buildImportResultKey, sanitizeFilename } from '../../config/storageConfig';
import { extractorRegistry } from '../extractors/ExtractorRegistry';
import { buildFileIndex } from '../extractors/openai/buildFileIndex';
import { parseConversationShard } from '../extractors/openai/parseConversationShard';
import type { ExtractManifest, ExtractedFileEntry, FileReference } from '../extractors/types';
import type { ImportJobRepository, ImportedFileRecord } from '../ports/ImportJobRepository';
import type { StoragePort } from '../ports/StoragePort';
import type { ImportCompleteDto, ImportJobMessage } from '../../shared/dtos/import';
import { parseConversations } from '../../shared/import-parser/parseConversations';
import type { ChatThread } from '../../shared/import-parser/types';
import { attachmentTypeFromMime, guessMimeType } from '../../shared/utils/mime';
import { logger } from '../../shared/utils/logger';
import { InvalidArchiveError } from '../../shared/errors/domain';
import {
  classifyImportProcessingError,
  type ImportProcessingStage,
} from '../../shared/utils/importProcessingError';

export class ImportProcessingService {
  constructor(
    private readonly repo: ImportJobRepository,
    private readonly storage: StoragePort
  ) {}

  async processMessage(message: ImportJobMessage, workerId: string): Promise<void> {
    const acquired = await this.repo.tryMarkProcessing(message.jobId, workerId);
    if (!acquired) {
      logger.info(
        { event: 'fs.worker.message.duplicate_skip', jobId: message.jobId, workerId },
        'Job already processing or not queued — skip'
      );
      return;
    }

    const workStarted = Date.now();
    logger.info(
      {
        event: 'fs.worker.message.received',
        jobId: message.jobId,
        userId: message.userId,
        provider: message.provider,
        workerId,
      },
      'Import SQS message received'
    );

    const workDir = path.join(os.tmpdir(), 'graphnode-import', message.jobId);
    const zipLocal = path.join(workDir, 'source.zip');
    let stage: ImportProcessingStage = 'acquire_job';

    try {
      fs.mkdirSync(workDir, { recursive: true });
      stage = 'download_zip';
      await this.storage.downloadToFile(message.stagingS3Key, zipLocal);
      await this.repo.updateProgress(message.jobId, 10);

      stage = 'extract_archive';
      const extractor = extractorRegistry.get(message.provider);
      const manifest = await extractor.extract(zipLocal, workDir);
      const fileIndex = buildFileIndex(manifest.files);
      const shards = extractor.listConversationShards(manifest);

      if (shards.length === 0) {
        throw new InvalidArchiveError('No conversation JSON shards found in archive');
      }

      logger.info(
        {
          event: 'fs.extractor.archive.extracted',
          jobId: message.jobId,
          shards: shards.length,
          files: manifest.files.length,
          stats: manifest.stats,
        },
        'Archive extracted'
      );

      await this.repo.updateProgress(message.jobId, 25);

      stage = 'parse_shards';
      const allThreads: ChatThread[] = [];
      const allRefs: FileReference[] = [];
      const refKeys = new Set<string>();

      for (let i = 0; i < shards.length; i++) {
        const shardPath = shards[i];
        const conversations = parseConversationShard(shardPath);
        const shardThreads = parseConversations(conversations);
        allThreads.push(...shardThreads);

        for (const conv of conversations) {
          const refs = await extractor.extractFileReferencesFromConversation(conv, manifest);
          for (const r of refs) {
            const key = `${r.providerMessageKey}:${r.providerFileId}`;
            if (refKeys.has(key)) continue;
            refKeys.add(key);
            allRefs.push(r);
          }
        }

        const pct = 25 + Math.floor(((i + 1) / shards.length) * 20);
        await this.repo.updateProgress(message.jobId, pct);
      }

      await this.repo.updateProgress(message.jobId, 45);

      stage = 'persist_files';
      const resolvePath = (ref: FileReference, m: ExtractManifest) =>
        extractor.resolveFilePath(ref, m, fileIndex);

      const fileIdByProviderId = await this.persistFiles(message, manifest, allRefs, resolvePath, fileIndex);
      await this.repo.updateProgress(message.jobId, 75);

      const unresolved: ImportCompleteDto['unresolvedLinks'] = [];
      const messageAttachmentMap = new Map<string, string[]>();

      for (const ref of allRefs) {
        const fileId = fileIdByProviderId.get(ref.providerFileId);
        if (!fileId) {
          unresolved.push({
            providerMessageKey: ref.providerMessageKey,
            reason: `file not found for id ${ref.providerFileId}`,
          });
          continue;
        }
        await this.repo.createMessageLink({
          jobId: message.jobId,
          providerConversationKey: ref.providerConversationKey,
          providerMessageKey: ref.providerMessageKey,
          importedFileId: fileId,
          confidence: 'exact',
        });
        const list = messageAttachmentMap.get(ref.providerMessageKey) ?? [];
        list.push(fileId);
        messageAttachmentMap.set(ref.providerMessageKey, list);
      }

      const uploadedFiles = await this.repo.listFilesByJob(message.jobId);
      const payload = this.buildCompletePayload(
        message,
        allThreads,
        messageAttachmentMap,
        uploadedFiles,
        unresolved
      );
      stage = 'upload_result';
      const resultKey = buildImportResultKey(message.jobId);
      await this.storage.uploadJson(resultKey, payload);

      stage = 'complete_job';
      await this.repo.completeJob(
        message.jobId,
        {
          conversationCount: payload.conversations.length,
          messageCount: payload.conversations.reduce((n, c) => n + c.messages.length, 0),
          fileCount: fileIdByProviderId.size,
          linkedCount: allRefs.length - unresolved.length,
          unresolvedCount: unresolved.length,
        },
        resultKey
      );

      logger.info(
        {
          event: 'fs.worker.job.completed',
          jobId: message.jobId,
          userId: message.userId,
          provider: message.provider,
          conversations: payload.conversations.length,
          shards: shards.length,
          unresolved: unresolved.length,
          durationMs: Date.now() - workStarted,
        },
        'Import worker job completed'
      );
    } catch (err) {
      const { code, detail } = classifyImportProcessingError(err, stage);
      logger.error(
        {
          event: 'fs.worker.message.failed',
          err,
          jobId: message.jobId,
          userId: message.userId,
          stage,
          errorCode: code,
          errorDetail: detail,
          provider: message.provider,
          durationMs: Date.now() - workStarted,
        },
        'Import worker job failed'
      );
      await this.repo.failJob(message.jobId, code, detail);
      throw err;
    } finally {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private async persistFiles(
    message: ImportJobMessage,
    manifest: ExtractManifest,
    refs: FileReference[],
    resolve: (ref: FileReference, manifest: ExtractManifest) => string | null,
    fileIndex: Map<string, ExtractedFileEntry>
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniqueRefs = new Map<string, FileReference>();
    for (const r of refs) {
      if (!uniqueRefs.has(r.providerFileId)) uniqueRefs.set(r.providerFileId, r);
    }

    for (const ref of uniqueRefs.values()) {
      const abs = resolve(ref, manifest);
      if (!abs || !fs.existsSync(abs)) continue;

      const fileId = ulid();
      const buf = fs.readFileSync(abs);
      const mime = ref.mimeType ?? guessMimeType(abs);
      const fromIndex = fileIndex.get(ref.providerFileId);
      const manifestEntry =
        fromIndex ?? manifest.files.find((f) => f.absolutePath === abs);
      // DB/첨부 메타에는 ZIP에서 복원한 원본명, S3 key에만 sanitize 적용
      const displayName =
        manifestEntry?.originalName?.trim() ||
        path.basename(manifestEntry?.relativePath ?? abs);
      const safeName = sanitizeFilename(displayName);
      const s3Key = buildImportFileKey(message.userId, fileId, safeName);

      await this.storage.upload(s3Key, buf, mime);
      await this.repo.createImportedFile({
        id: fileId,
        jobId: message.jobId,
        userId: message.userId,
        providerSlug: message.provider,
        providerFileId: ref.providerFileId,
        relativePath: manifestEntry?.relativePath ?? displayName,
        originalName: displayName,
        mimeType: mime,
        sizeBytes: BigInt(buf.length),
        sha256: manifestEntry?.sha256 ?? '',
        s3Key,
        status: 'uploaded',
      });

      map.set(ref.providerFileId, fileId);
    }

    return map;
  }

  private buildCompletePayload(
    message: ImportJobMessage,
    threads: ChatThread[],
    messageAttachmentMap: Map<string, string[]>,
    uploadedFiles: ImportedFileRecord[],
    unresolved: ImportCompleteDto['unresolvedLinks']
  ): ImportCompleteDto {
    const fileById = new Map(uploadedFiles.map((f) => [f.id, f]));

    const conversations = threads.map((th) => ({
      id: th.id,
      title: th.title || 'Untitled',
      messages: th.messages.map((m) => {
        const providerKey = m.providerNodeId ?? m.id;
        const fileIds = messageAttachmentMap.get(providerKey) ?? [];
        const attachments = fileIds
          .map((fid) => {
            const meta = fileById.get(fid);
            if (!meta) return null;
            return {
              id: fid,
              type: attachmentTypeFromMime(meta.mimeType),
              url: fid,
              name: meta.originalName,
              mimeType: meta.mimeType,
              size: Number(meta.sizeBytes),
            };
          })
          .filter((a): a is NonNullable<typeof a> => a != null);

        return {
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: new Date(m.ts).toISOString(),
          attachments: attachments.length ? attachments : undefined,
        };
      }),
    }));

    return {
      jobId: message.jobId,
      userId: message.userId,
      provider: message.provider,
      conversations,
      unresolvedLinks: unresolved?.length ? unresolved : undefined,
    };
  }
}
