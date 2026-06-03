/**
 * 모듈: openAiAttachments
 *
 * OpenAI conversations.json의 mapping 노드를 순회하며
 * content.parts 내 file_id / image_file_id / asset_pointer 참조를 수집합니다.
 */
import { toMarkdownFromUnknown } from './toMarkdown';

export interface OpenAiFileReference {
  providerFileId: string;
  providerMessageKey: string;
  providerConversationKey?: string;
  mimeType?: string;
  kind: 'file' | 'image' | 'asset';
}

/** sediment://file_00000000abc 또는 file-xxx → ZIP 내 파일명 prefix */
export function normalizeOpenAiFileId(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('file-service://')) return '';
  const sediment = s.match(/sediment:\/\/(file_[a-f0-9]+)/i);
  if (sediment) return sediment[1];
  const filePrefix = s.match(/(file_[a-f0-9]+)/i);
  if (filePrefix) return filePrefix[1];
  return s;
}

function pushRef(
  out: OpenAiFileReference[],
  fileId: string,
  nodeId: string,
  convId: string | undefined,
  kind: OpenAiFileReference['kind'],
  mimeType?: string
) {
  const id = normalizeOpenAiFileId(fileId);
  if (!id) return;
  out.push({
    providerFileId: id,
    providerMessageKey: nodeId,
    providerConversationKey: convId,
    mimeType,
    kind,
  });
}

function collectParts(parts: unknown, nodeId: string, convId: string | undefined, out: OpenAiFileReference[]) {
  if (!Array.isArray(parts)) return;
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const p = part as Record<string, unknown>;
    const type = String(p.type ?? p.content_type ?? '');

    if (type === 'file' && p.file_id) {
      pushRef(out, String(p.file_id), nodeId, convId, 'file', typeof p.mime_type === 'string' ? p.mime_type : undefined);
    }
    if ((type === 'image_file' || type === 'image') && (p.image_file_id || p.file_id)) {
      pushRef(out, String(p.image_file_id ?? p.file_id), nodeId, convId, 'image');
    }
    /** ChatGPT 최신 export: content_type image_asset_pointer + asset_pointer "sediment://file_..." */
    if (type === 'image_asset_pointer' && typeof p.asset_pointer === 'string') {
      pushRef(out, p.asset_pointer, nodeId, convId, 'image');
    }
    if (typeof p.asset_pointer === 'string' && p.asset_pointer.includes('file_')) {
      pushRef(out, p.asset_pointer, nodeId, convId, 'asset');
    }
    if (p.asset_pointer && typeof p.asset_pointer === 'object') {
      const ap = p.asset_pointer as Record<string, unknown>;
      const assetId = ap.asset_id ?? ap.id;
      if (assetId) pushRef(out, String(assetId), nodeId, convId, 'asset');
    }
  }
}
function walkMessageContent(content: unknown, nodeId: string, convId: string | undefined, out: OpenAiFileReference[]) {
  if (!content) return;
  if (typeof content === 'object' && !Array.isArray(content)) {
    const c = content as Record<string, unknown>;
    if (Array.isArray(c.parts)) collectParts(c.parts, nodeId, convId, out);
  }
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === 'object') {
        const it = item as Record<string, unknown>;
        if (Array.isArray(it.parts)) collectParts(it.parts, nodeId, convId, out);
        else collectParts([item], nodeId, convId, out);
      }
    }
  }
}

function isThoughtsContent(content: unknown): boolean {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
  const c = content as Record<string, unknown>;
  const t = String(c.content_type ?? c.type ?? '').toLowerCase();
  return t === 'thoughts' || t === 'reasoning_recap';
}

function collectRefsFromMapping(
  conv: Record<string, unknown>,
  out: OpenAiFileReference[]
): void {
  const convId = String(conv.id ?? conv.conversation_id ?? '');
  const mapping = conv.mapping as Record<string, { id?: string; message?: Record<string, unknown> }> | undefined;
  if (!mapping) return;

  for (const [nodeId, node] of Object.entries(mapping)) {
    const msg = node?.message;
    if (!msg) continue;
    const hidden = (msg.metadata as Record<string, unknown> | undefined)?.is_visually_hidden_from_conversation;
    if (hidden) continue;
    if (isThoughtsContent(msg.content)) continue;
    walkMessageContent(msg.content, nodeId || String(node.id ?? ''), convId, out);
    void toMarkdownFromUnknown(msg.content);
  }
}

/** 단일 conversation 객체에서 파일 참조 추출 */
export function extractOpenAiFileReferencesFromConversation(
  conv: Record<string, unknown>
): OpenAiFileReference[] {
  const out: OpenAiFileReference[] = [];
  collectRefsFromMapping(conv, out);
  return dedupeRefs(out);
}

/** OpenAI export conversations.json(배열)에서 메시지별 파일 참조를 추출합니다. */
export function extractOpenAiFileReferences(rawJson: unknown): OpenAiFileReference[] {
  const out: OpenAiFileReference[] = [];
  if (!Array.isArray(rawJson)) return out;

  for (const conv of rawJson as Array<Record<string, unknown>>) {
    collectRefsFromMapping(conv, out);
  }

  return dedupeRefs(out);
}

function dedupeRefs(out: OpenAiFileReference[]): OpenAiFileReference[] {
  const seen = new Set<string>();
  return out.filter((r) => {
    if (!r.providerFileId) return false;
    const k = `${r.providerMessageKey}:${r.providerFileId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
