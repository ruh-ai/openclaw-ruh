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
  });
});
