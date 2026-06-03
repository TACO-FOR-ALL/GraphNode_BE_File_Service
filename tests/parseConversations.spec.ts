import { parseConversations } from '../src/shared/import-parser/parseConversations';

describe('parseConversations', () => {
  it('parses minimal OpenAI export array', () => {
    const json = [
      {
        title: 'Test chat',
        current_node: 'node-2',
        mapping: {
          'node-1': {
            id: 'node-1',
            parent: null,
            message: {
              author: { role: 'user' },
              content: { parts: [{ text: 'Hello' }] },
              create_time: 1700000000,
            },
          },
          'node-2': {
            id: 'node-2',
            parent: 'node-1',
            message: {
              author: { role: 'assistant' },
              content: { parts: [{ text: 'Hi there' }] },
              create_time: 1700000001,
            },
          },
        },
      },
    ];

    const threads = parseConversations(json);
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe('Test chat');
    expect(threads[0].messages).toHaveLength(2);
    expect(threads[0].messages[0].role).toBe('user');
    expect(threads[0].messages[1].role).toBe('assistant');
  });
});
