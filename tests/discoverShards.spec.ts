import { discoverConversationShards } from '../src/core/extractors/openai/discoverShards';
import type { ExtractedFileEntry } from '../src/core/extractors/types';

describe('discoverConversationShards', () => {
  it('sorts conversations-NNN.json shards', () => {
    const files: ExtractedFileEntry[] = [
      mk('conversations-002.json', '/a/002'),
      mk('conversations-000.json', '/a/000'),
      mk('conversations-001.json', '/a/001'),
    ];
    const shards = discoverConversationShards(files);
    expect(shards).toEqual(['/a/000', '/a/001', '/a/002']);
  });

  it('falls back to conversations.json', () => {
    const files = [mk('conversations.json', '/legacy')];
    expect(discoverConversationShards(files)).toEqual(['/legacy']);
  });
});

function mk(name: string, abs: string): ExtractedFileEntry {
  return {
    relativePath: name,
    absolutePath: abs,
    originalName: name,
    sizeBytes: 1,
  };
}
