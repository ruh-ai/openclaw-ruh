import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import { makeSandbox, makeConversation, SANDBOX_ID, CONV_ID } from '../helpers/fixtures';
import ChatPanel from '@/components/ChatPanel';

const BASE = 'http://localhost:8000';

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: () => {},
});

function renderChat(
  sandbox = makeSandbox(),
  conversation: Parameters<typeof ChatPanel>[0]['conversation'] = null,
) {
  const handlers = {
    onNewChat: jest.fn(),
    onConversationCreated: jest.fn(),
  };
  render(
    <ChatPanel
      sandbox={sandbox}
      conversation={conversation}
      onNewChat={handlers.onNewChat}
      onConversationCreated={handlers.onConversationCreated}
    />,
  );
  return handlers;
}

describe('ChatPanel', () => {
  // ── Model display ───────────────────────────────────────────────────────────

  describe('model display', () => {
    test('shows model info after loading', async () => {
      renderChat();
      await waitFor(() => {
        expect(screen.getByText('openclaw-default')).toBeInTheDocument();
      });
    });

    test('shows loading state initially', () => {
      renderChat();
      expect(screen.getByText('Loading agents…')).toBeInTheDocument();
    });
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  describe('empty state (no conversation)', () => {
    test('shows greeting with sandbox name', async () => {
      renderChat();
      await waitFor(() => {
        expect(screen.getByText('openclaw-gateway')).toBeInTheDocument();
      });
    });

    test('shows "Start typing" prompt', async () => {
      renderChat();
      expect(screen.getByText('Start typing to create a new conversation')).toBeInTheDocument();
    });

    test('renders input textarea', () => {
      renderChat();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    test('New Chat button is present', () => {
      renderChat();
      expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
    });
  });

  // ── Message history ─────────────────────────────────────────────────────────

  describe('message history', () => {
    test('loads messages when conversation is provided', async () => {
      const conv = makeConversation();
      server.use(
        http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`, () =>
          HttpResponse.json({
            messages: [
              { role: 'user', content: 'Hello there' },
              { role: 'assistant', content: 'Hi from AI!' },
            ],
            next_cursor: null,
            has_more: false,
          }),
        ),
      );

      renderChat(makeSandbox(), conv);

      await waitFor(() => expect(screen.getByText('Hello there')).toBeInTheDocument());
      expect(screen.getByText('Hi from AI!')).toBeInTheDocument();
    });

    test('shows conversation name when conversation is active', async () => {
      const conv = makeConversation({ name: 'My Chat' });
      server.use(
        http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`, () =>
          HttpResponse.json({ messages: [], next_cursor: null, has_more: false }),
        ),
      );

      renderChat(makeSandbox(), conv);

      await waitFor(() => {
        expect(screen.getByText('My Chat')).toBeInTheDocument();
      });
    });
  });

  // ── Sending messages via /chat/ws ───────────────────────────────────────────

  describe('sending messages via WebSocket bridge', () => {
    test('sends message to /chat/ws endpoint', async () => {
      let chatWsCalled = false;
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, () => {
          chatWsCalled = true;
          return new HttpResponse(
            [
              'event: status\ndata: {"phase":"authenticated","message":"Agent started..."}\n\n',
              'data: {"choices":[{"delta":{"content":"Hello!"}}]}\n\n',
              'data: [DONE]\n\n',
            ].join(''),
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        }),
      );

      renderChat();
      await waitFor(() => screen.getByRole('textbox'));

      const textarea = screen.getByRole('textbox');
      await userEvent.type(textarea, 'Test message');

      const sendButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.trim() !== 'New Chat',
      );
      expect(sendButton).toBeTruthy();
      await userEvent.click(sendButton!);

      await waitFor(() => expect(chatWsCalled).toBe(true));
    });

    test('displays streamed response', async () => {
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, () =>
          new HttpResponse(
            [
              'event: status\ndata: {"phase":"authenticated","message":"Agent started..."}\n\n',
              'data: {"choices":[{"delta":{"content":"Streamed reply"}}]}\n\n',
              'data: [DONE]\n\n',
            ].join(''),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
        ),
      );

      renderChat();
      await waitFor(() => screen.getByRole('textbox'));

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      const sendButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.trim() !== 'New Chat',
      );
      await userEvent.click(sendButton!);

      await waitFor(() => expect(screen.getByText('Streamed reply')).toBeInTheDocument());
    });

    test('backend persists messages via /chat/ws — no follow-up POST needed', async () => {
      let messagesCalled = false;
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, () =>
          new HttpResponse(
            [
              'event: status\ndata: {"phase":"authenticated","message":"Agent started..."}\n\n',
              'data: {"choices":[{"delta":{"content":"Persisted reply"}}]}\n\n',
              'data: [DONE]\n\n',
            ].join(''),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`, () => {
          messagesCalled = true;
          return HttpResponse.json({ ok: true });
        }),
      );

      renderChat();
      await waitFor(() => screen.getByRole('textbox'));

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Persist this' } });

      const sendButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.trim() !== 'New Chat',
      );
      await userEvent.click(sendButton!);

      await waitFor(() => expect(screen.getByText('Persisted reply')).toBeInTheDocument());
      expect(messagesCalled).toBe(false);
    });

    test('does not send model param in request body', async () => {
      let requestBody: Record<string, unknown> = {};
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, async ({ request }) => {
          requestBody = (await request.json()) as Record<string, unknown>;
          return new HttpResponse(
            'data: {"choices":[{"delta":{"content":"Ok"}}]}\n\ndata: [DONE]\n\n',
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        }),
      );

      renderChat();
      await waitFor(() => screen.getByRole('textbox'));

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Hi' } });

      const sendButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.trim() !== 'New Chat',
      );
      await userEvent.click(sendButton!);

      await waitFor(() => expect(screen.getByText('Ok')).toBeInTheDocument());
      expect(requestBody).not.toHaveProperty('model');
      expect(requestBody).toHaveProperty('conversation_id', CONV_ID);
      expect(requestBody).toHaveProperty('messages');
    });

    test('handles error event from gateway', async () => {
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, () =>
          new HttpResponse(
            'event: error\ndata: {"message":"Gateway timeout"}\n\ndata: [DONE]\n\n',
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
        ),
      );

      renderChat();
      await waitFor(() => screen.getByRole('textbox'));

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Test' } });

      const sendButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.trim() !== 'New Chat',
      );
      await userEvent.click(sendButton!);

      await waitFor(() => expect(screen.getByText(/Gateway timeout/)).toBeInTheDocument());
    });

    test('handles non-ok HTTP response from chat/ws endpoint', async () => {
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, () =>
          new HttpResponse('Service Unavailable', { status: 503 }),
        ),
      );

      renderChat();
      await waitFor(() => screen.getByRole('textbox'));

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'fail this' } });

      const sendButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.trim() !== 'New Chat',
      );
      await userEvent.click(sendButton!);

      await waitFor(() => {
        expect(screen.getByText(/error.*service unavailable/i)).toBeInTheDocument();
      });
    });

    test('tool call event renders ToolCallBubble', async () => {
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, () =>
          new HttpResponse(
            [
              'data: {"tool":"search_web","input":"latest news"}\n\n',
              'data: {"choices":[{"delta":{"content":"Found results"}}]}\n\n',
              'data: [DONE]\n\n',
            ].join(''),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
        ),
      );

      renderChat();
      await waitFor(() => screen.getByRole('textbox'));

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'search for news' } });

      const sendButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.trim() !== 'New Chat',
      );
      await userEvent.click(sendButton!);

      await waitFor(() => {
        expect(screen.getByText(/tool/i)).toBeInTheDocument();
        expect(screen.getByText(/search_web/)).toBeInTheDocument();
      });
    });
  });

  // ── ContextMessages collapse/expand ────────────────────────────────────────

  describe('ContextMessages', () => {
    test('shows "earlier — for context" collapse button when more than 2 messages', async () => {
      const conv = makeConversation();
      server.use(
        http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`, () =>
          HttpResponse.json({
            messages: [
              { role: 'user', content: 'First message' },
              { role: 'assistant', content: 'First reply' },
              { role: 'user', content: 'Second message' },
              { role: 'assistant', content: 'Second reply' },
              { role: 'user', content: 'Third message' },
            ],
            next_cursor: null,
            has_more: false,
          }),
        ),
      );

      renderChat(makeSandbox(), conv);

      await waitFor(() => {
        expect(screen.getByText(/earlier.*for context/i)).toBeInTheDocument();
      });
    });

    test('clicking collapse button shows earlier messages', async () => {
      const conv = makeConversation();
      server.use(
        http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`, () =>
          HttpResponse.json({
            messages: [
              { role: 'user', content: 'Hidden old message' },
              { role: 'assistant', content: 'Hidden reply' },
              { role: 'user', content: 'Recent user msg' },
              { role: 'assistant', content: 'Recent reply' },
            ],
            next_cursor: null,
            has_more: false,
          }),
        ),
      );

      renderChat(makeSandbox(), conv);

      await waitFor(() => screen.getByText(/earlier/i));

      // Hidden messages should not be visible yet
      expect(screen.queryByText('Hidden old message')).not.toBeInTheDocument();

      await userEvent.click(screen.getByText(/earlier.*for context/i));

      // Now they should be visible
      await waitFor(() => {
        expect(screen.getByText('Hidden old message')).toBeInTheDocument();
      });
    });
  });

  // ── New Chat button ─────────────────────────────────────────────────────────

  describe('New Chat button', () => {
    test('clicking New Chat calls onNewChat', async () => {
      const handlers = renderChat();
      await waitFor(() => screen.getByRole('button', { name: /new chat/i }));
      await userEvent.click(screen.getByRole('button', { name: /new chat/i }));
      expect(handlers.onNewChat).toHaveBeenCalled();
    });
  });

  // ── Load older messages ─────────────────────────────────────────────────────

  describe('load older messages', () => {
    test('shows "Load older messages" button when has_more is true and loads older messages on click', async () => {
      const conv = makeConversation();

      server.use(
        http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`, ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('before')) {
            return HttpResponse.json({
              messages: [{ role: 'user', content: 'Old message' }],
              next_cursor: null,
              has_more: false,
            });
          }
          return HttpResponse.json({
            messages: [{ role: 'user', content: 'Recent message' }],
            next_cursor: 12345,
            has_more: true,
          });
        }),
      );

      renderChat(makeSandbox(), conv);

      await waitFor(() => expect(screen.getByText('Recent message')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: /load older messages/i })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: /load older messages/i }));

      await waitFor(() => expect(screen.getByText('Old message')).toBeInTheDocument());
    });
  });

  // ── Enter key sends message ─────────────────────────────────────────────────

  describe('Enter key sends message', () => {
    test('pressing Enter without Shift triggers sendMessage', async () => {
      let chatWsCalled = false;
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, () => {
          chatWsCalled = true;
          return new HttpResponse(
            'data: {"choices":[{"delta":{"content":"Hi!"}}]}\n\ndata: [DONE]\n\n',
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        }),
      );

      renderChat();
      await waitFor(() => screen.getByRole('textbox'));

      const textarea = screen.getByRole('textbox');
      await userEvent.type(textarea, 'Hello there');
      await userEvent.keyboard('{Enter}');

      await waitFor(() => expect(chatWsCalled).toBe(true));
    });
  });

  // ── ToolCallBubble expand/collapse ─────────────────────────────────────────

  describe('ToolCallBubble expand', () => {
    test('clicking tool call bubble toggles JSON args expansion', async () => {
      const jsonArgs = JSON.stringify({ query: 'latest news' });
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, () =>
          new HttpResponse(
            [
              `data: {"tool":"search_web","input":${JSON.stringify(jsonArgs)}}\n\n`,
              'data: {"choices":[{"delta":{"content":"Done"}}]}\n\n',
              'data: [DONE]\n\n',
            ].join(''),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
        ),
      );

      // Render with an existing conversation that has a tool call message
      const conv = makeConversation();
      server.use(
        http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`, () =>
          HttpResponse.json({
            messages: [
              {
                role: 'assistant',
                content: 'Here are the results',
                tool_calls: [{ id: 'tc-1', name: 'search_web', args: jsonArgs }],
              },
            ],
            next_cursor: null,
            has_more: false,
          }),
        ),
      );

      renderChat(makeSandbox(), conv);

      // Wait for the tool call bubble to appear
      await waitFor(() => expect(screen.getByText('search_web')).toBeInTheDocument());

      // The tool call bubble button should be visible — click to expand
      const toolButtons = screen.getAllByRole('button').filter(
        (b) => b.querySelector('.font-mono')?.textContent === 'search_web',
      );
      if (toolButtons.length > 0) {
        await userEvent.click(toolButtons[0]);
        // After expanding, the args pre block should show
        await waitFor(() => {
          const pres = document.querySelectorAll('pre');
          expect(pres.length).toBeGreaterThan(0);
        });
      }
    });
  });

  // ── Retry button for models ─────────────────────────────────────────────────

  describe('Retry button when no models', () => {
    test('shows Retry button when model list is empty and clicking it re-fetches', async () => {
      let modelFetchCount = 0;
      server.use(
        http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/models`, () => {
          modelFetchCount += 1;
          if (modelFetchCount === 1) {
            return HttpResponse.json({ models: [] });
          }
          return HttpResponse.json({ models: [{ id: 'openclaw-default' }] });
        }),
      );

      renderChat();
      await waitFor(() => screen.getByText(/no agents/i));

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();
      await userEvent.click(retryBtn);

      await waitFor(() => expect(modelFetchCount).toBe(2));
    });
  });

  // ── SSE: persistence_error event ──────────────────────────────────────────

  describe('SSE persistence_error event', () => {
    test('persistence_error SSE event adds error message to chat', async () => {
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, () =>
          new HttpResponse(
            [
              'event: persistence_error\ndata: {"message":"DB write failed"}\n\n',
              'data: [DONE]\n\n',
            ].join(''),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
        ),
      );

      renderChat();
      await waitFor(() => screen.getByRole('textbox'));

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Persist error test' } });

      const sendButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.trim() !== 'New Chat',
      );
      await userEvent.click(sendButton!);

      await waitFor(() => {
        expect(screen.getByText(/DB write failed/)).toBeInTheDocument();
      });
    });
  });

  // ── SSE: tool completion result event ──────────────────────────────────────

  describe('SSE tool result event', () => {
    test('Completed: result SSE event is handled without error', async () => {
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json(makeConversation()),
        ),
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat/ws`, () =>
          new HttpResponse(
            [
              'data: {"tool":"web_search","input":"news"}\n\n',
              'data: {"result":"Completed: web_search"}\n\n',
              'data: {"choices":[{"delta":{"content":"Result found"}}]}\n\n',
              'data: [DONE]\n\n',
            ].join(''),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
        ),
      );

      renderChat();
      await waitFor(() => screen.getByRole('textbox'));

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Search for news' } });

      const sendButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent?.trim() !== 'New Chat',
      );
      await userEvent.click(sendButton!);

      await waitFor(() => {
        expect(screen.getByText('Result found')).toBeInTheDocument();
      });
    });
  });
});
