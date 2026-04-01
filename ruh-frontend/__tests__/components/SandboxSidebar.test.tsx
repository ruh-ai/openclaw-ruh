import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import { makeSandbox, SANDBOX_ID } from '../helpers/fixtures';
import SandboxSidebar from '@/components/SandboxSidebar';

const BASE = 'http://localhost:8000';

const defaultProps = {
  selectedId: null,
  onSelect: jest.fn(),
  onNew: jest.fn(),
  refreshKey: 0,
  isCollapsed: false,
  onToggleCollapse: jest.fn(),
};

function renderSidebar(props = {}) {
  return render(<SandboxSidebar {...defaultProps} {...props} />);
}

describe('SandboxSidebar', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Loading state ────────────────────────────────────────────────────────────

  test('shows loading text initially', () => {
    renderSidebar();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  // ── Empty state ──────────────────────────────────────────────────────────────

  test('shows empty state when no sandboxes returned', async () => {
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([])));
    renderSidebar();
    await waitFor(() => expect(screen.getByText('No sandboxes yet.')).toBeInTheDocument());
    expect(screen.getByText('Create one →')).toBeInTheDocument();
  });

  test('"Create one →" button calls onNew', async () => {
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([])));
    renderSidebar();
    await waitFor(() => screen.getByText('Create one →'));
    await userEvent.click(screen.getByText('Create one →'));
    expect(defaultProps.onNew).toHaveBeenCalledTimes(1);
  });

  // ── Populated state ──────────────────────────────────────────────────────────

  test('renders sandbox name and truncated ID', async () => {
    renderSidebar();
    await waitFor(() => screen.getByText('openclaw-gateway'));
    expect(screen.getByText('sb-test-001…')).toBeInTheDocument();
    // sandbox name visible
    expect(screen.getAllByText('openclaw-gateway').length).toBeGreaterThan(0);
  });

  test('renders approved sandbox with green status dot class', async () => {
    server.use(http.get(`${BASE}/api/sandboxes`, () =>
      HttpResponse.json([makeSandbox({ approved: true })]),
    ));
    const { container } = renderSidebar();
    await waitFor(() => screen.getByText('openclaw-gateway'));
    const dot = container.querySelector('.bg-green-400');
    expect(dot).toBeInTheDocument();
  });

  test('renders pending sandbox with yellow pulsing status dot', async () => {
    server.use(http.get(`${BASE}/api/sandboxes`, () =>
      HttpResponse.json([makeSandbox({ approved: false })]),
    ));
    const { container } = renderSidebar();
    await waitFor(() => screen.getByText('openclaw-gateway'));
    const dot = container.querySelector('.bg-yellow-400');
    expect(dot).toBeInTheDocument();
  });

  test('clicking sandbox item calls onSelect with sandbox data', async () => {
    const sandbox = makeSandbox();
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])));
    renderSidebar();
    await waitFor(() => screen.getByText('openclaw-gateway'));
    await userEvent.click(screen.getByText('openclaw-gateway'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith(sandbox);
  });

  test('selected sandbox has highlighted styling', async () => {
    server.use(http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([makeSandbox()])));
    const { container } = renderSidebar({ selectedId: SANDBOX_ID });
    await waitFor(() => screen.getByText('openclaw-gateway'));
    const item = container.querySelector('.bg-\\[\\#fdf4ff\\]');
    expect(item).toBeInTheDocument();
  });

  // ── Delete ───────────────────────────────────────────────────────────────────

  test('delete button removes sandbox from list', async () => {
    const sandbox = makeSandbox();
    server.use(
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])),
      http.delete(`${BASE}/api/sandboxes/${SANDBOX_ID}`, () => HttpResponse.json({ deleted: SANDBOX_ID })),
    );
    renderSidebar();
    await waitFor(() => screen.getByText('openclaw-gateway'));

    const deleteBtn = screen.getByTitle('Remove');
    await userEvent.click(deleteBtn);

    await waitFor(() => expect(screen.queryByText('openclaw-gateway')).not.toBeInTheDocument());
  });

  test('delete button does not also select the sandbox', async () => {
    const sandbox = makeSandbox();
    server.use(
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])),
      http.delete(`${BASE}/api/sandboxes/${SANDBOX_ID}`, () => HttpResponse.json({ deleted: SANDBOX_ID })),
    );

    const onSelect = jest.fn();
    renderSidebar({ onSelect });
    await waitFor(() => screen.getByText('openclaw-gateway'));

    await userEvent.click(screen.getByTitle('Remove'));

    expect(onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('openclaw-gateway')).not.toBeInTheDocument());
  });

  test('delete failure keeps sandbox visible in the list', async () => {
    const sandbox = makeSandbox();
    server.use(
      http.get(`${BASE}/api/sandboxes`, () => HttpResponse.json([sandbox])),
      http.delete(
        `${BASE}/api/sandboxes/${SANDBOX_ID}`,
        () => HttpResponse.json({ detail: 'delete failed' }, { status: 500 }),
      ),
    );

    renderSidebar();
    await waitFor(() => screen.getByText('openclaw-gateway'));

    await userEvent.click(screen.getByTitle('Remove'));

    expect(screen.getByText('openclaw-gateway')).toBeInTheDocument();
  });

  // ── + New button ─────────────────────────────────────────────────────────────

  test('+ New button calls onNew', async () => {
    renderSidebar();
    const newBtn = screen.getByText('New Sandbox');
    await userEvent.click(newBtn);
    expect(defaultProps.onNew).toHaveBeenCalledTimes(1);
  });

  // ── Refresh ───────────────────────────────────────────────────────────────────

  test('re-fetches sandboxes when refreshKey changes', async () => {
    let callCount = 0;
    server.use(http.get(`${BASE}/api/sandboxes`, () => {
      callCount++;
      return HttpResponse.json([makeSandbox()]);
    }));

    const { rerender } = renderSidebar({ refreshKey: 0 });
    await waitFor(() => expect(callCount).toBe(1));

    rerender(<SandboxSidebar {...defaultProps} refreshKey={1} />);
    await waitFor(() => expect(callCount).toBe(2));
  });

  // ── API error handling ────────────────────────────────────────────────────────

  test('handles API error gracefully — does not crash', async () => {
    // Use HTTP 500 (not HttpResponse.error()) so the component's try/finally
    // handles it without an unhandled promise rejection.
    server.use(
      http.get(`${BASE}/api/sandboxes`, () =>
        HttpResponse.json({ error: 'internal error' }, { status: 500 }),
      ),
    );
    renderSidebar();
    // Loading state ends even on error (res.ok is false → setSandboxes skipped → finally runs)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  });
});
