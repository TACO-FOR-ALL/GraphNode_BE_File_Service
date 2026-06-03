/**
 * ZIP 플랫 manifest → provider file_id → ExtractedFileEntry 인덱스.
 */
import type { ExtractedFileEntry } from '../types';
import { normalizeOpenAiFileId } from '../../../shared/import-parser/openAiAttachments';

const FILE_ID_IN_PATH = /(file_[a-f0-9]{8,})/gi;

export function buildFileIndex(files: ExtractedFileEntry[]): Map<string, ExtractedFileEntry> {
  const index = new Map<string, ExtractedFileEntry>();

  const add = (key: string, entry: ExtractedFileEntry) => {
    const norm = normalizeOpenAiFileId(key);
    if (!norm || norm.startsWith('file-service://')) return;
    if (!index.has(norm)) index.set(norm, entry);
  };

  for (const f of files) {
    const base = f.originalName.replace(/\.[^.]+$/, '');
    add(base, f);
    add(f.originalName, f);

    const rel = f.relativePath.replace(/\\/g, '/');
    const parts = rel.split('/');
    for (const part of parts) {
      add(part.replace(/\.[^.]+$/, ''), f);
    }

    let m: RegExpExecArray | null;
    FILE_ID_IN_PATH.lastIndex = 0;
    while ((m = FILE_ID_IN_PATH.exec(rel)) !== null) {
      add(m[1], f);
    }
  }

  return index;
}

export function resolveFromFileIndex(
  providerFileId: string,
  index: Map<string, ExtractedFileEntry>
): ExtractedFileEntry | null {
  const id = normalizeOpenAiFileId(providerFileId);
  if (!id || id.startsWith('file-service://')) return null;

  const direct = index.get(id);
  if (direct) return direct;

  for (const [key, entry] of index) {
    if (key.includes(id) || id.includes(key)) return entry;
  }
  return null;
}
