/**
 * 모듈: Extractor 공통 타입
 */

export interface ExtractedFileEntry {
  relativePath: string;
  absolutePath: string;
  originalName: string;
  sizeBytes: number;
  sha256?: string;
}

export interface ExtractManifestStats {
  nestedZipCount: number;
  totalFiles: number;
  totalUncompressedBytes: number;
  maxZipDepth: number;
}

export interface ExtractManifest {
  workDir: string;
  files: ExtractedFileEntry[];
  /** 정렬된 conversation shard 절대경로 (합치지 않고 순회) */
  conversationShards: string[];
  exportManifestPath?: string;
  /** @deprecated 단일 conversations.json — conversationShards[0]과 동일 */
  conversationJsonPath?: string | null;
  stats?: ExtractManifestStats;
}

export interface FileReference {
  providerFileId: string;
  providerMessageKey: string;
  providerConversationKey?: string;
  mimeType?: string;
  kind: 'file' | 'image' | 'asset';
}

export interface ProviderCapabilities {
  supportsZipImport: boolean;
  supportsConversationJson: boolean;
  maxZipBytes: number;
}

export interface ZipExtractLimits {
  maxZipBytes: number;
  maxZipDepth: number;
  maxNestedZips: number;
  maxEntries: number;
  maxUncompressedBytes: number;
}

export interface IConversationArchiveExtractor {
  readonly slug: string;
  readonly capabilities: ProviderCapabilities;

  extract(zipPath: string, workDir: string): Promise<ExtractManifest>;
  listConversationShards(manifest: ExtractManifest): string[];

  /** 레거시 — listConversationShards 사용 권장 */
  findConversationJson(manifest: ExtractManifest): string | null;

  extractFileReferences(rawJson: unknown, manifest: ExtractManifest): Promise<FileReference[]>;
  extractFileReferencesFromConversation(
    conv: Record<string, unknown>,
    manifest: ExtractManifest
  ): Promise<FileReference[]>;

  resolveFilePath(
    ref: FileReference,
    manifest: ExtractManifest,
    fileIndex?: Map<string, ExtractedFileEntry>
  ): string | null;
}
