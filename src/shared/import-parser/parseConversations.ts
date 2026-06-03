/**
 * 모듈: parseConversations
 *
 * GraphNode FE `parseConversations.ts` 포팅.
 * OpenAI export(conversations.json 배열 + mapping 트리) 및 단순 threads/messages 형식 지원.
 *
 * 첨부 파일 메타는 openAiAttachments.ts에서 별도 추출합니다.
 */
import { toMarkdownFromUnknown } from './toMarkdown';
import { ChatMessage, ChatThread } from './types';
import { newId } from './uuid';

const mapRole = (raw: unknown): ChatRole => {
  const r = String(raw ?? '').toLowerCase();
  if (r.includes('assist')) return 'assistant';
  if (r.includes('system') || r === 'sys') return 'system';
  return 'user';
};

const toMs = (v: unknown): number | undefined => {
  const n = Number(v);
  if (!isFinite(n)) return;
  return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
};

type ChatRole = ChatMessage['role'];

/**
 * OpenAI mapping: current_node에서 parent를 따라 실제 대화 경로만 복원.
 * (재생성 브랜치 등 비표시 노드 제외)
 */
function getOpenAIConversationPath(conv: Record<string, unknown>): Array<Record<string, unknown>> {
  const mapping = conv?.mapping as Record<string, Record<string, unknown>> | undefined;
  if (!mapping || typeof mapping !== 'object') return [];

  const currentNodeId = conv.current_node as string | undefined;
  if (!currentNodeId || !mapping[currentNodeId]) {
    return Object.values(mapping).filter((node) => node && node.message);
  }

  const path: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let nodeId: string | null = currentNodeId;

  while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
    seen.add(nodeId);
    path.push(mapping[nodeId]);
    nodeId = (mapping[nodeId]?.parent as string) ?? null;
  }

  return path.reverse().filter((node) => node && node.message);
}

export function parseConversations(json: unknown): ChatThread[] {
  const threads: ChatThread[] = [];
  const isMsg = (x: ChatMessage | null): x is ChatMessage => x != null;

  const root = json as Record<string, unknown>;

  if (Array.isArray(root?.threads)) {
    for (const th of root.threads as Array<Record<string, unknown>>) {
      const msgs = (Array.isArray(th?.messages) ? th.messages : [])
        .map((m) => toSimpleMsg(m))
        .filter(isMsg);
      if (!msgs.length) continue;
      threads.push({ id: newId(), title: String(th?.title ?? ''), messages: msgs, updatedAt: Date.now() });
    }
    return threads;
  }

  if (Array.isArray(json)) {
    const arr = json as unknown[];
    const looksLikeOpenAI = arr.some(
      (it) => it && typeof it === 'object' && (it as Record<string, unknown>).mapping
    );

    if (looksLikeOpenAI) {
      for (const conv of arr as Array<Record<string, unknown>>) {
        const nodes = getOpenAIConversationPath(conv);
        const convId = String(conv.id ?? conv.conversation_id ?? '');

        const msgs = nodes
          .map((n) => {
            const msg = n.message as Record<string, unknown> | undefined;
            if (!msg) return null;
            const role = mapRole(msg?.author && typeof msg.author === 'object' ? (msg.author as Record<string, unknown>).role : msg.role);
            const content = toMarkdownFromUnknown(msg?.content ?? msg?.text ?? '');
            const hidden = (msg?.metadata as Record<string, unknown> | undefined)?.is_visually_hidden_from_conversation;
            const contentObj = msg?.content;
            const contentType =
              contentObj && typeof contentObj === 'object' && !Array.isArray(contentObj)
                ? String((contentObj as Record<string, unknown>).content_type ?? (contentObj as Record<string, unknown>).type ?? '')
                : '';
            const isThoughts =
              contentType.toLowerCase() === 'thoughts' || contentType.toLowerCase() === 'reasoning_recap';
            if (hidden || isThoughts || !content.trim()) return null;
            const ts =
              toMs(msg?.create_time) ?? toMs(n?.create_time) ?? toMs(conv?.create_time) ?? Date.now();
            return {
              id: newId(),
              role,
              content,
              ts,
              /** Worker가 message_file_links 매칭에 사용 */
              providerNodeId: String(n.id ?? ''),
            } as ChatMessage;
          })
          .filter((m): m is ChatMessage => !!m);

        if (msgs.length) {
          const maxMsgTs = Math.max(...msgs.map((m) => m.ts));
          threads.push({
            id: newId(),
            title: String(conv?.title ?? 'Untitled'),
            messages: msgs,
            updatedAt: maxMsgTs || Date.now(),
            providerConversationId: convId,
          });
        }
      }
      return threads;
    }
  }

  return threads;
}

function toSimpleMsg(m: unknown): ChatMessage | null {
  const raw = m as Record<string, unknown>;
  const role = mapRole(raw.role ?? raw.author ?? raw.speaker);
  const content = toMarkdownFromUnknown(raw.content ?? raw.text ?? raw.message ?? raw.delta ?? '');
  if (!content) return null;
  const ts = Number(raw.ts ?? raw.time ?? raw.create_time ?? Date.now());
  return { id: newId(), role, content, ts: isFinite(ts) ? ts : Date.now() };
}
