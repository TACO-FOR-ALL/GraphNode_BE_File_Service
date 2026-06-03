/**
 * conversation shard 파일 파싱 — JSON 배열 / NDJSON / 단일 객체.
 */
import * as fs from 'fs';

import { InvalidArchiveError } from '../../../shared/errors/domain';

export function parseConversationShard(filePath: string): Record<string, unknown>[] {
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new InvalidArchiveError(`Expected array in ${filePath}`);
    }
    return parsed.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
  }

  if (raw.startsWith('{')) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      let ndjsonOk = true;
      const out: Record<string, unknown>[] = [];
      for (const line of lines) {
        if (!line.startsWith('{')) {
          ndjsonOk = false;
          break;
        }
        try {
          const obj = JSON.parse(line) as unknown;
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            out.push(obj as Record<string, unknown>);
          }
        } catch {
          ndjsonOk = false;
          break;
        }
      }
      if (ndjsonOk && out.length > 0) return out;
    }

    const single = JSON.parse(raw) as Record<string, unknown>;
    if (single.mapping) return [single];
    if (Array.isArray(single.conversations)) {
      return (single.conversations as unknown[]).filter(
        (x): x is Record<string, unknown> => !!x && typeof x === 'object'
      );
    }
    return [single];
  }

  throw new InvalidArchiveError(`Unrecognized conversation shard format: ${filePath}`);
}
