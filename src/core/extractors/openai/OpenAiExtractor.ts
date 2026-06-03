/**
 * 모듈: OpenAiExtractor (ChatGPT export ZIP)
 *
 * - 재귀 ZIP 해제 → 플랫 manifest
 * - conversations-000.json … shard 스트리밍 (합치지 않음)
 * - buildFileIndex로 file_id → ZIP 경로 매칭
 */
import {
  extractOpenAiFileReferences,
  extractOpenAiFileReferencesFromConversation,
  normalizeOpenAiFileId,
} from '../../../shared/import-parser/openAiAttachments';
import type {
  IConversationArchiveExtractor,
  ExtractManifest,
  ExtractedFileEntry,
  FileReference,
  ProviderCapabilities,
} from '../types';
import { buildFileIndex, resolveFromFileIndex } from './buildFileIndex';
import {
  discoverConversationShards,
  findExportManifestPath,
  readManifestShardHints,
} from './discoverShards';
import { findFileByBasename, unzipRecursively } from './zipUtils';

const CONVERSATION_JSON_NAMES = ['conversations.json', 'chat.html', 'messages.json'];

export class OpenAiExtractor implements IConversationArchiveExtractor {
  readonly slug = 'openai';
  readonly capabilities: ProviderCapabilities = {
    supportsZipImport: true,
    supportsConversationJson: true,
    maxZipBytes: 5_368_709_120,
  };

  async extract(zipPath: string, workDir: string): Promise<ExtractManifest> {
    const result = unzipRecursively(zipPath, workDir, {
      maxZipBytes: readZipLimit('MAX_ZIP_BYTES', this.capabilities.maxZipBytes),
      maxZipDepth: readZipLimit('MAX_ZIP_DEPTH', 3),
      maxNestedZips: readZipLimit('MAX_NESTED_ZIPS', 50),
      maxEntries: readZipLimit('MAX_ZIP_ENTRIES', 10_000),
      maxUncompressedBytes: readZipLimit('MAX_UNCOMPRESSED_BYTES', 2_147_483_648),
    });

    const exportManifestPath = findExportManifestPath(result.files);
    let conversationShards = discoverConversationShards(result.files);

    const hints = readManifestShardHints(exportManifestPath);
    if (hints.length > 0) {
      const byHint = hints
        .map((h) => result.files.find((f) => f.relativePath.endsWith(h) || f.originalName === h))
        .filter((f): f is ExtractedFileEntry => !!f)
        .map((f) => f.absolutePath);
      if (byHint.length > 0) conversationShards = byHint;
    }

    if (conversationShards.length === 0) {
      for (const name of CONVERSATION_JSON_NAMES) {
        const hit = result.files.find(
          (f) => f.originalName.toLowerCase() === name || f.relativePath.toLowerCase().endsWith(name)
        );
        if (hit) {
          conversationShards = [hit.absolutePath];
          break;
        }
      }
    }

    return {
      workDir,
      files: result.files,
      conversationShards,
      exportManifestPath,
      conversationJsonPath: conversationShards[0] ?? null,
      stats: {
        nestedZipCount: result.nestedZipCount,
        totalFiles: result.files.length,
        totalUncompressedBytes: result.totalUncompressedBytes,
        maxZipDepth: result.maxZipDepth,
      },
    };
  }

  listConversationShards(manifest: ExtractManifest): string[] {
    if (manifest.conversationShards.length > 0) return manifest.conversationShards;
    const legacy = this.findConversationJson(manifest);
    return legacy ? [legacy] : [];
  }

  findConversationJson(manifest: ExtractManifest): string | null {
    return manifest.conversationJsonPath ?? manifest.conversationShards[0] ?? null;
  }

  async extractFileReferences(rawJson: unknown, _manifest: ExtractManifest): Promise<FileReference[]> {
    return extractOpenAiFileReferences(rawJson).map(toFileRef);
  }

  async extractFileReferencesFromConversation(
    conv: Record<string, unknown>,
    _manifest: ExtractManifest
  ): Promise<FileReference[]> {
    return extractOpenAiFileReferencesFromConversation(conv).map(toFileRef);
  }

  resolveFilePath(
    ref: FileReference,
    manifest: ExtractManifest,
    fileIndex?: Map<string, ExtractedFileEntry>
  ): string | null {
    const index = fileIndex ?? buildFileIndex(manifest.files);
    const fromIndex = resolveFromFileIndex(ref.providerFileId, index);
    if (fromIndex) return fromIndex.absolutePath;

    const id = normalizeOpenAiFileId(ref.providerFileId);
    if (!id || id.startsWith('file-service://')) return null;

    const hints = [
      id,
      `${id}-sanitized.png`,
      `${id}-sanitized.jpg`,
      `${id}.png`,
      `${id}.jpg`,
      `file-${id}`,
      `dalle-generations/${id}`,
    ];
    const byName = findFileByBasename(manifest.files, hints);
    if (byName) return byName;

    const partial = manifest.files.find(
      (f) =>
        f.relativePath.includes(id) ||
        f.originalName.includes(id) ||
        f.relativePath.toLowerCase().startsWith(id.toLowerCase())
    );
    return partial?.absolutePath ?? null;
  }
}

function readZipLimit(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function toFileRef(r: {
  providerFileId: string;
  providerMessageKey: string;
  providerConversationKey?: string;
  mimeType?: string;
  kind: 'file' | 'image' | 'asset';
}): FileReference {
  return {
    providerFileId: r.providerFileId,
    providerMessageKey: r.providerMessageKey,
    providerConversationKey: r.providerConversationKey,
    mimeType: r.mimeType,
    kind: r.kind,
  };
}
