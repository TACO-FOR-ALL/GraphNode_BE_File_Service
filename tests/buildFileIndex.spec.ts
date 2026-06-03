import { buildFileIndex, resolveFromFileIndex } from '../src/core/extractors/openai/buildFileIndex';
import type { ExtractedFileEntry } from '../src/core/extractors/types';

describe('buildFileIndex', () => {
  it('indexes file_* id from relative path', () => {
    const files: ExtractedFileEntry[] = [
      {
        relativePath: 'user-abc/file/file_00000000deadbeef.png',
        absolutePath: '/tmp/file_00000000deadbeef.png',
        originalName: 'file_00000000deadbeef.png',
        sizeBytes: 100,
      },
    ];
    const index = buildFileIndex(files);
    const hit = resolveFromFileIndex('sediment://file_00000000deadbeef', index);
    expect(hit?.absolutePath).toBe('/tmp/file_00000000deadbeef.png');
  });

  it('ignores file-service:// refs', () => {
    const index = buildFileIndex([]);
    expect(resolveFromFileIndex('file-service://abc', index)).toBeNull();
  });
});
