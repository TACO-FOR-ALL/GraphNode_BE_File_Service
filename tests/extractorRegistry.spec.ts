import { ExtractorRegistry } from '../src/core/extractors/ExtractorRegistry';
import { ProviderNotImplementedError } from '../src/shared/errors/domain';

describe('ExtractorRegistry', () => {
  const registry = new ExtractorRegistry();

  it('lists openai as enabled', () => {
    const providers = registry.listProviders();
    const openai = providers.find((p) => p.slug === 'openai');
    expect(openai?.enabled).toBe(true);
    expect(providers.find((p) => p.slug === 'gemini')?.enabled).toBe(false);
  });

  it('returns OpenAi extractor for openai', () => {
    expect(registry.get('openai').slug).toBe('openai');
  });

  it('throws for disabled provider', () => {
    expect(() => registry.get('gemini')).toThrow(ProviderNotImplementedError);
  });
});
