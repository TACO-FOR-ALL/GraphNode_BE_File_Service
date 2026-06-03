import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { parseConversationShard } from '../src/core/extractors/openai/parseConversationShard';

describe('parseConversationShard', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    tmpFiles.length = 0;
  });

  function writeTmp(name: string, body: string): string {
    const p = path.join(os.tmpdir(), `gn-shard-${Date.now()}-${name}`);
    fs.writeFileSync(p, body, 'utf-8');
    tmpFiles.push(p);
    return p;
  }

  it('parses JSON array', () => {
    const p = writeTmp('arr.json', JSON.stringify([{ id: 'c1', mapping: {} }]));
    const rows = parseConversationShard(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('c1');
  });

  it('parses single object with mapping', () => {
    const p = writeTmp('one.json', JSON.stringify({ id: 'c2', mapping: { n1: {} } }));
    const rows = parseConversationShard(p);
    expect(rows).toHaveLength(1);
  });

  it('parses NDJSON lines', () => {
    const lines = ['{"id":"a","mapping":{}}', '{"id":"b","mapping":{}}'].join('\n');
    const p = writeTmp('nd.json', lines);
    const rows = parseConversationShard(p);
    expect(rows).toHaveLength(2);
  });
});
