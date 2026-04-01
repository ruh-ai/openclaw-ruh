import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import HistoryPanel from '@/components/HistoryPanel';
import { server } from '../helpers/server';
import { makeConversation, makeSandbox, SANDBOX_ID } from '../helpers/fixtures';

const BASE = 'http://localhost:8000';

describe('HistoryPanel', () => {
  test('loads the newest conversation page and can fetch older history explicitly', async () => {
    const requestedUrls: string[] = [];

    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, ({ request }) => {
        requestedUrls.push(request.url);

        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor');
        if (cursor) {
          return HttpResponse.json({
            items: [makeConversation({ id: 'conv-old', name: 'Older Conversation' })],
            next_cursor: null,
            has_more: false,
          });
        }

        return HttpResponse.json({
          items: [makeConversation({ id: 'conv-new', name: 'Newest Conversation' })],
          next_cursor: '2026-03-25T10:00:00.000Z|conv-new',
          has_more: true,
        });
      }),
    );

    render(
      <HistoryPanel
        sandbox={makeSandbox()}
        activeConvId={null}
        onOpenConversation={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText('Newest Conversation')).toBeInTheDocument());
    expect(screen.queryByText('Older Conversation')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => expect(screen.getByText('Older Conversation')).toBeInTheDocument());
    expect(requestedUrls.some((url) => url.includes('cursor='))).toBe(true);
  });

  test('keeps a conversation visible when delete fails', async () => {
    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
        HttpResponse.json({
          items: [makeConversation({ id: 'conv-stays', name: 'Keep Me' })],
          next_cursor: null,
          has_more: false,
        }),
      ),
      http.delete(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/conv-stays`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    render(
      <HistoryPanel
        sandbox={makeSandbox()}
        activeConvId={null}
        onOpenConversation={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText('Keep Me')).toBeInTheDocument());

    await userEvent.hover(screen.getByText('Keep Me').closest('.group') as HTMLElement);
    await userEvent.click(screen.getByTitle('Delete'));

    expect(screen.getByText('Keep Me')).toBeInTheDocument();
  });

  test('rename flow: click edit, type new name, press Enter to commit', async () => {
    const user = userEvent.setup();

    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
        HttpResponse.json({
          items: [makeConversation({ id: 'conv-rename', name: 'Old Name' })],
          next_cursor: null,
          has_more: false,
        }),
      ),
      http.patch(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations/conv-rename`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );

    render(
      <HistoryPanel
        sandbox={makeSandbox()}
        activeConvId={null}
        onOpenConversation={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText('Old Name')).toBeInTheDocument());

    await user.hover(screen.getByText('Old Name').closest('.group') as HTMLElement);
    await user.click(screen.getByTitle('Rename'));

    const input = screen.getByDisplayValue('Old Name');
    await user.clear(input);
    await user.type(input, 'New Name{Enter}');

    await waitFor(() => expect(screen.getByText('New Name')).toBeInTheDocument());
  });

  test('updates conversation name when conv:renamed event fires', async () => {
    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/conversations`, () =>
        HttpResponse.json({
          items: [makeConversation({ id: 'conv-evt', name: 'Before Event' })],
          next_cursor: null,
          has_more: false,
        }),
      ),
    );

    render(
      <HistoryPanel
        sandbox={makeSandbox()}
        activeConvId={null}
        onOpenConversation={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText('Before Event')).toBeInTheDocument());

    window.dispatchEvent(
      new CustomEvent('conv:renamed', { detail: { id: 'conv-evt', name: 'After Event' } }),
    );

    await waitFor(() => expect(screen.getByText('After Event')).toBeInTheDocument());
  });
});
