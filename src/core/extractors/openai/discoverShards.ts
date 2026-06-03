/**
 * 플랫 manifest에서 conversation JSON shard 경로 탐색.
 */
import * as fs from 'fs';

import type { ExtractedFileEntry } from '../types';

const SHARD_PATTERN = /conversations-\d+\.json$/i;
const LEGACY_NAME = 'conversations.json';
const EXPORT_MANIFEST = 'export_manifest.json';

export function findExportManifestPath(files: ExtractedFileEntry[]): string | undefined {
  const hit = files.find(
    (f) =>
      f.originalName.toLowerCase() === EXPORT_MANIFEST ||
      f.relativePath.toLowerCase().endsWith(`/${EXPORT_MANIFEST}`)
  );
  return hit?.absolutePath;
}

/**
 * export_manifest 힌트가 있으면 우선 사용 (있을 때만).
 */
export function readManifestShardHints(manifestPath: string | undefined): string[] {
  if (!manifestPath) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    const hints: string[] = [];
    const push = (v: unknown) => {
      if (typeof v === 'string' && SHARD_PATTERN.test(v)) hints.push(v);
    };
    if (Array.isArray(raw.conversation_files)) {
      for (const x of raw.conversation_files) push(x);
    }
    if (Array.isArray(raw.data)) {
      for (const x of raw.data) {
        if (x && typeof x === 'object' && typeof (x as Record<string, unknown>).path === 'string') {
          push((x as Record<string, unknown>).path);
        }
      }
    }
    return hints;
  } catch {
    return [];
  }
}

export function discoverConversationShards(files: ExtractedFileEntry[]): string[] {
  const shardHits = files
    .filter(
      (f) =>
        SHARD_PATTERN.test(f.originalName) ||
        SHARD_PATTERN.test(f.relativePath.split('/').pop() ?? '')
    )
    .map((f) => f.absolutePath);

  if (shardHits.length > 0) {
    return shardHits.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  const legacy = files.find(
    (f) =>
      f.originalName.toLowerCase() === LEGACY_NAME ||
      f.relativePath.toLowerCase().endsWith(`/${LEGACY_NAME}`)
  );
  if (legacy) return [legacy.absolutePath];

  return [];
}
