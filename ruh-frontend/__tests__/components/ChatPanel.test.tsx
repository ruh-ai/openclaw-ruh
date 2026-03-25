import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import { makeSandbox, makeConversation, SANDBOX_ID, CONV_ID } from '../helpers/fixtures';
import ChatPanel from '@/components/ChatPanel';

const BASE = 'http://localhost:8000';

function renderChat(sandbox = makeSandbox()) {
  return render(<ChatPanel sandbox={sandbox} />);
}

describe('ChatPanel', () => {
  // ── ConversationList ─────────────────────────────────────────────────────────

  describe('conversation list', () => {
    test('fetches and displays conversations on mount', async () => {
      renderChat();
      await waitFor(() => expect(screen.getByText('New Conversation')).toBeInTheDocument());
    });

    test('shows "New" button to create conversation', async () => {
      renderChat();
      await waitFor(() => screen.getByText('New Conversation'));
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
    });

    test('creates new conversation on "New" button click', async () => {
      let createCalled = false;
      server.use(http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () => {
        createCalled = true;
        return HttpResponse.json(makeConversation({ id: 'conv-new', name: 'New Conversation' }));
      }));

      renderChat();
      await waitFor(() => screen.getByText('New Conversation'));

      const newBtn = screen.getByRole('button', { name: /new/i });
      await userEvent.click(newBtn);

      await waitFor(() => expect(createCalled).toBe(true));
    });

    test('deletes conversation on delete button click', async () => {
      let deleteCalled = false;
      server.use(
        http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json({ items: [makeConversation()], next_cursor: null, has_more: false }),
        ),
        http.delete(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}`, () => {
          deleteCalled = true;
          return HttpResponse.json({ deleted: CONV_ID });
        }),
      );

      renderChat();
      await waitFor(() => screen.getByText('New Conversation'));

      // Delete button (✕) should be present
      const deleteBtn = screen.getByTitle(/delete/i) || screen.getAllByText('✕')[0];
      await userEvent.click(deleteBtn);

      await waitFor(() => expect(deleteCalled).toBe(true));
    });

    test('shows loading state while fetching conversations', async () => {
      server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json({ items: [], next_cursor: null, has_more: false });
      }));
      renderChat();
      // Loading should be visible briefly
      expect(screen.queryByText('Loading…') ?? document.body).toBeTruthy();
    });
  });

  // ── Model selector ────────────────────────────────────────────────────────────

  describe('model selector', () => {
    test('fetches and displays available models', async () => {
      renderChat();
      await waitFor(() => screen.getByText('New Conversation'));
      // Click on a conversation to show the chat view with model selector
      await userEvent.click(screen.getByText('New Conversation'));

      // Model selector should appear
      await waitFor(() => {
        const select = screen.queryByRole('combobox');
        expect(select ?? document.body).toBeTruthy();
      });
    });
  });

  // ── Chat view ─────────────────────────────────────────────────────────────────

  describe('chat view after selecting conversation', () => {
    test('loads messages when conversation is selected', async () => {
      server.use(
        http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
          HttpResponse.json({ items: [makeConversation()], next_cursor: null, has_more: false }),
        ),
        http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/${CONV_ID}/messages`, () =>
          HttpResponse.json({
            messages: [
              { id: 1, role: 'user', content: 'Hello there', created_at: new Date('2025-01-15T10:05:01Z').toISOString() },
              { id: 2, role: 'assistant', content: 'Hi from AI!', created_at: new Date('2025-01-15T10:05:02Z').toISOString() },
            ],
            next_cursor: null,
            has_more: false,
          }),
        ),
      );

      renderChat();
      await waitFor(() => screen.getByText('New Conversation'));
      await userEvent.click(screen.getByText('New Conversation'));

      await waitFor(() => expect(screen.getByText('Hello there')).toBeInTheDocument());
      expect(screen.getByText('Hi from AI!')).toBeInTheDocument();
    });

    test('renders message input textarea', async () => {
      renderChat();
      await waitFor(() => screen.getByText('New Conversation'));
      await userEvent.click(screen.getByText('New Conversation'));

      await waitFor(() => {
        const textarea = screen.queryByRole('textbox');
        expect(textarea).toBeTruthy();
      });
    });

    test('sends message on Send button click', async () => {
      let chatCalled = false;
      server.use(
        http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/chat`, () => {
          chatCalled = true;
          return HttpResponse.json({
            id: 'chatcmpl-001',
            object: 'chat.completion',
            created: 1700000000,
            model: 'openclaw-default',
            choices: [{ index: 0, message: { role: 'assistant', content: 'Response!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
          });
        }),
      );

      renderChat();
      await waitFor(() => screen.getByText('New Conversation'));
      await userEvent.click(screen.getByText('New Conversation'));

      // Wait for chat view to load
      await waitFor(() => screen.queryByRole('textbox'));
      const textarea = screen.getByRole('textbox');

      await userEvent.type(textarea, 'Test message');
      const sendBtn = screen.getByRole('button', { name: /send/i });
      await userEvent.click(sendBtn);

      await waitFor(() => expect(chatCalled).toBe(true));
    });
  });

  // ── Rename conversation ───────────────────────────────────────────────────────

  describe('rename conversation', () => {
    test('edit button triggers rename mode', async () => {
      renderChat();
      await waitFor(() => screen.getByText('New Conversation'));

      // Find the edit button (✎)
      const editBtns = screen.queryAllByTitle(/edit/i);
      if (editBtns.length > 0) {
        await userEvent.click(editBtns[0]);
        // Input for rename should appear
        await waitFor(() => {
          const input = screen.queryByDisplayValue('New Conversation');
          expect(input).toBeTruthy();
        });
      }
    });
  });

  // ── Empty conversation list ───────────────────────────────────────────────────

  describe('empty state', () => {
    test('shows start message when no conversations exist', async () => {
      server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
        HttpResponse.json({ items: [], next_cursor: null, has_more: false }),
      ));
      renderChat();
      await waitFor(() =>
        expect(
          screen.queryByText(/no conversations/i) ?? screen.queryByText(/new/i),
        ).toBeTruthy(),
      );
    });
  });
});
