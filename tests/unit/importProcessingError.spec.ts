import { describe, it, expect } from '@jest/globals';

import { InvalidArchiveError } from '../../src/shared/errors/domain';
import { classifyImportProcessingError } from '../../src/shared/utils/importProcessingError';

describe('classifyImportProcessingError', () => {
  it('maps InvalidArchiveError to INVALID_ARCHIVE', () => {
    const result = classifyImportProcessingError(
      new InvalidArchiveError('bad zip'),
      'extract_archive'
    );
    expect(result.code).toBe('INVALID_ARCHIVE');
    expect(result.detail).toBe('bad zip');
  });

  it('uses stage default code for generic errors', () => {
    const result = classifyImportProcessingError(
      new Error('network'),
      'download_zip'
    );
    expect(result.code).toBe('IMPORT_DOWNLOAD_FAILED');
    expect(result.detail).toContain('download_zip');
  });

  it('maps mongo duplicate key to IMPORT_DUPLICATE_KEY', () => {
    const result = classifyImportProcessingError(
      Object.assign(new Error('dup'), { code: 11000 }),
      'persist_files'
    );
    expect(result.code).toBe('IMPORT_DUPLICATE_KEY');
  });
});
