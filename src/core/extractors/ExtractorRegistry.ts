/**
 * 모듈: ExtractorRegistry (프로바이더별 ZIP 추출기 레지스트리)
 *
 * 책임:
 * - AI export ZIP을 해제·분류하는 extractor 구현체를 slug별로 등록·조회합니다.
 * - FE 프로바이더 선택란(`listProviders`)과 import 요청 시 구현체 선택(`get`)에 사용합니다.
 *
 * 확장:
 * - 새 프로바이더 추가 시 PROVIDER_META에 항목 추가 + `register(slug, factory)` 호출.
 * - v1: openai만 enabled, 나머지는 StubExtractor(501).
 */
import type { ProviderDescriptor, ProviderSlug } from '../../shared/dtos/import';
import { ProviderNotImplementedError } from '../../shared/errors/domain';
import { OpenAiExtractor } from './openai/OpenAiExtractor';
import { StubExtractor } from './StubExtractor';
import type { IConversationArchiveExtractor } from './types';

/** FE/BFF에 노출할 프로바이더 메타 (enabled=false면 UI 비활성) */
const PROVIDER_META: Array<{
  slug: ProviderSlug;
  label: string;
  enabled: boolean;
  reason?: ProviderDescriptor['reason'];
}> = [
  { slug: 'openai', label: 'ChatGPT', enabled: true },
  { slug: 'gemini', label: 'Gemini', enabled: false, reason: 'coming_soon' },
  { slug: 'claude', label: 'Claude', enabled: false, reason: 'coming_soon' },
  { slug: 'deepseek', label: 'DeepSeek', enabled: false, reason: 'coming_soon' },
];

export class ExtractorRegistry {
  private readonly factories = new Map<ProviderSlug, () => IConversationArchiveExtractor>();

  constructor() {
    this.register('openai', () => new OpenAiExtractor());
    for (const slug of ['gemini', 'claude', 'deepseek']) {
      this.register(slug, () => new StubExtractor(slug, slug));
    }
  }

  /** 런타임에 extractor 팩토리 등록 (테스트·신규 프로바이더용) */
  register(slug: ProviderSlug, factory: () => IConversationArchiveExtractor): void {
    this.factories.set(slug, factory);
  }

  /** GET /internal/import-providers 응답용 */
  listProviders(): ProviderDescriptor[] {
    return PROVIDER_META.map((p) => ({
      slug: p.slug,
      label: p.label,
      enabled: p.enabled,
      reason: p.reason,
    }));
  }

  /** import 생성 전 활성 여부 확인 */
  isEnabled(slug: ProviderSlug): boolean {
    return PROVIDER_META.find((p) => p.slug === slug)?.enabled ?? false;
  }

  /**
   * 활성화된 프로바이더의 extractor 인스턴스 반환.
   * @throws {ProviderNotImplementedError} 미지원·비활성 slug
   */
  get(slug: ProviderSlug): IConversationArchiveExtractor {
    const meta = PROVIDER_META.find((p) => p.slug === slug);
    if (!meta) {
      throw new ProviderNotImplementedError(`Unknown provider: ${slug}`);
    }
    if (!meta.enabled) {
      throw new ProviderNotImplementedError(`Provider "${slug}" is not available yet`, { slug });
    }
    const factory = this.factories.get(slug);
    if (!factory) {
      throw new ProviderNotImplementedError(`No extractor registered for: ${slug}`);
    }
    return factory();
  }
}

/** 앱 전역 싱글톤 레지스트리 */
export const extractorRegistry = new ExtractorRegistry();
