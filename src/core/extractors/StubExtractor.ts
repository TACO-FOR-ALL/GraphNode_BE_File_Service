/**
 * 모듈: StubExtractor
 *
 * 아직 구현되지 않은 프로바이더(gemini, claude, deepseek 등)용 플레이스홀더.
 * 호출 시 ProviderNotImplementedError(501) — SQS enqueue 전 API에서 차단하는 것이 권장.
 */
import { ProviderNotImplementedError } from '../../shared/errors/domain';
import type { IConversationArchiveExtractor, ExtractManifest, FileReference, ProviderCapabilities } from './types';

export class StubExtractor implements IConversationArchiveExtractor {
  readonly capabilities: ProviderCapabilities = {
    supportsZipImport: false,
    supportsConversationJson: false,
    maxZipBytes: 0,
  };

  constructor(readonly slug: string, readonly label: string) {}

  async extract(): Promise<ExtractManifest> {
    throw new ProviderNotImplementedError(`Provider "${this.slug}" is not implemented yet`, { slug: this.slug });
  }

  listConversationShards(): string[] {
    throw new ProviderNotImplementedError(`Provider "${this.slug}" is not implemented yet`);
  }

  findConversationJson(): string | null {
    throw new ProviderNotImplementedError(`Provider "${this.slug}" is not implemented yet`);
  }

  async extractFileReferences(): Promise<FileReference[]> {
    throw new ProviderNotImplementedError(`Provider "${this.slug}" is not implemented yet`);
  }

  async extractFileReferencesFromConversation(): Promise<FileReference[]> {
    throw new ProviderNotImplementedError(`Provider "${this.slug}" is not implemented yet`);
  }

  resolveFilePath(): string | null {
    throw new ProviderNotImplementedError(`Provider "${this.slug}" is not implemented yet`);
  }
}
