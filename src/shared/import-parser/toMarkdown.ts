export function toMarkdownFromUnknown(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);

  if (Array.isArray(node)) {
    return node.map(toMarkdownFromUnknown).filter(Boolean).join('\n');
  }

  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.parts)) return toMarkdownFromUnknown(obj.parts);
  if (Array.isArray(obj.content)) return toMarkdownFromUnknown(obj.content);
  if (obj.content && typeof obj.content === 'object' && Array.isArray((obj.content as Record<string, unknown>).parts)) {
    return toMarkdownFromUnknown((obj.content as Record<string, unknown>).parts);
  }

  if (Array.isArray(obj.children)) {
    const inner = toMarkdownFromUnknown(obj.children);
    if (obj.type === 'heading' && obj.depth) return `${'#'.repeat(Number(obj.depth))} ${inner}`;
    if (obj.type === 'paragraph') return inner;
    if (obj.type === 'listItem') return `- ${inner}`;
    return inner;
  }

  const code =
    typeof obj.code === 'string'
      ? obj.code
      : (obj.type === 'code' || obj.content_type === 'code') && typeof obj.text === 'string'
        ? obj.text
        : undefined;
  if (typeof code === 'string') {
    const lang = (obj.lang || obj.language || '') as string;
    return `\`\`\`${lang}\n${code}\n\`\`\``;
  }

  if (obj.type === 'inlineCode' && typeof obj.value === 'string') return '`' + obj.value + '`';
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.value === 'string') return obj.value;
  if (typeof obj.literal === 'string') return obj.literal;

  if (obj.props && typeof obj.props === 'object') {
    return toMarkdownFromUnknown((obj.props as Record<string, unknown>).children);
  }

  return '';
}
