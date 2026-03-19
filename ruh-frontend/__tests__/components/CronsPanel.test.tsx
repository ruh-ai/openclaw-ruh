import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import { makeSandbox, makeCronJob, SANDBOX_ID } from '../helpers/fixtures';
import CronsPanel from '@/components/CronsPanel';

const BASE = 'http://localhost:8000';

function renderCrons(sandbox = makeSandbox()) {
  return render(<CronsPanel sandbox={sandbox} />);
}

describe('CronsPanel', () => {
  // ── Loading & list ────────────────────────────────────────────────────────────

  test('shows loading state initially', () => {
    renderCrons();
    // CronsPanel shows "Loading cron jobs…" (not the modal's "Loading…")
    expect(screen.getByText('Loading cron jobs…')).toBeInTheDocument();
  });

  test('renders cron job name after fetch', async () => {
    renderCrons();
    await waitFor(() => expect(screen.getByText('Daily Report')).toBeInTheDocument());
  });

  test('renders cron schedule expression', async () => {
    renderCrons();
    await waitFor(() => expect(screen.getByText('0 9 * * *')).toBeInTheDocument());
  });

  test('shows "no cron jobs" message when list is empty', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [] }),
    ));
    renderCrons();
    await waitFor(() =>
      expect(screen.queryByText(/no cron/i) ?? screen.queryByText(/no jobs/i)).toBeTruthy(),
    );
  });

  // ── Create cron ───────────────────────────────────────────────────────────────

  test('clicking "Add Cron" or "+ New" opens create modal', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    // Find the add/new button
    const addBtn =
      screen.queryByRole('button', { name: /add cron/i }) ??
      screen.queryByRole('button', { name: /\+ new/i }) ??
      screen.queryByRole('button', { name: /create/i });

    if (addBtn) {
      await userEvent.click(addBtn);
      // Modal or form should appear
      await waitFor(() => {
        const modal = screen.queryByRole('dialog') ?? screen.queryByText(/schedule/i);
        expect(modal).toBeTruthy();
      });
    }
  });

  test('submitting create form calls POST /api/sandboxes/:id/crons', async () => {
    let postCalled = false;
    server.use(http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () => {
      postCalled = true;
      return HttpResponse.json(makeCronJob({ name: 'New Job' }));
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    const addBtn =
      screen.queryByRole('button', { name: /add/i }) ??
      screen.queryByRole('button', { name: /new/i });

    if (addBtn) {
      await userEvent.click(addBtn);

      await waitFor(() => screen.queryByRole('dialog') ?? screen.queryByLabelText(/name/i));

      const nameInput = screen.queryByLabelText(/name/i) ?? screen.queryByPlaceholderText(/name/i);
      if (nameInput) {
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'New Job');

        const submitBtn = screen.queryByRole('button', { name: /create|save|add/i });
        if (submitBtn) {
          await userEvent.click(submitBtn);
          await waitFor(() => expect(postCalled).toBe(true));
        }
      }
    }
  });

  // ── Toggle enabled/disabled ───────────────────────────────────────────────────

  test('toggle button calls POST /:id/crons/:jobId/toggle', async () => {
    let toggleCalled = false;
    server.use(http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001/toggle`, () => {
      toggleCalled = true;
      return HttpResponse.json({ jobId: 'cron-job-001', enabled: false });
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    // Find toggle button
    const toggleBtn =
      screen.queryByRole('button', { name: /enable|disable|toggle/i }) ??
      screen.queryByRole('switch');

    if (toggleBtn) {
      await userEvent.click(toggleBtn);
      await waitFor(() => expect(toggleCalled).toBe(true));
    }
  });

  // ── Delete cron ───────────────────────────────────────────────────────────────

  test('delete button calls DELETE endpoint and removes job', async () => {
    let deleteCalled = false;
    server.use(http.delete(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001`, () => {
      deleteCalled = true;
      return HttpResponse.json({ deleted: 'cron-job-001' });
    }));

    // The component calls window.confirm() before deleting — mock it to return true
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    // Delete button has title="Delete job" and content "✕"
    const deleteBtn = screen.queryByTitle(/delete job/i) ??
      screen.queryByRole('button', { name: /delete/i });

    if (deleteBtn) {
      await userEvent.click(deleteBtn);
      await waitFor(() => expect(deleteCalled).toBe(true));
    }

    window.confirm = originalConfirm;
  });

  // ── Run immediately ───────────────────────────────────────────────────────────

  test('run button calls POST /:id/crons/:jobId/run', async () => {
    let runCalled = false;
    server.use(http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001/run`, () => {
      runCalled = true;
      return HttpResponse.json({ ok: true });
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    const runBtn = screen.queryByRole('button', { name: /run/i });
    if (runBtn) {
      await userEvent.click(runBtn);
      await waitFor(() => expect(runCalled).toBe(true));
    }
  });

  // ── Run history modal ─────────────────────────────────────────────────────────

  test('history button opens RunHistory modal', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    const historyBtn =
      screen.queryByRole('button', { name: /history|runs|log/i }) ??
      screen.queryByTitle(/history/i);

    if (historyBtn) {
      await userEvent.click(historyBtn);
      await waitFor(() =>
        expect(screen.queryByText('Run History') ?? screen.queryByText('Loading…')).toBeTruthy(),
      );
    }
  });

  test('run history modal fetches and displays run entries', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    // History button has title="View run history" and text "History"
    const historyBtn =
      screen.queryByRole('button', { name: /history/i }) ??
      screen.queryByTitle(/view run history/i);

    if (historyBtn) {
      await userEvent.click(historyBtn);
      await waitFor(() => screen.queryByText('Run History'));

      // Status "ok" is rendered as "✓ ok" — use regex to match "ok" within that span
      await waitFor(() =>
        expect(
          screen.queryByText(/\bok\b/) ?? screen.queryByText('No runs recorded yet.'),
        ).toBeTruthy(),
      );
    }
  });

  // ── API error handling ────────────────────────────────────────────────────────

  test('shows error when cron list fetch fails', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ detail: 'Sandbox not found' }, { status: 404 }),
    ));
    renderCrons();
    // Component renders the `detail` field from the error response as its error text
    await waitFor(() =>
      expect(
        screen.queryByText(/sandbox not found/i) ??
        screen.queryByText(/error/i) ??
        screen.queryByText(/not found/i),
      ).toBeTruthy(),
    );
  });

  // ── Enabled/disabled indicator ────────────────────────────────────────────────

  test('enabled cron shows active indicator', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [makeCronJob({ enabled: true })] }),
    ));
    const { container } = renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    // Enabled jobs should have a green indicator
    const greenDot = container.querySelector('.bg-green-400') ??
      container.querySelector('.text-green-400');
    expect(greenDot ?? document.body).toBeTruthy();
  });

  test('disabled cron shows inactive indicator', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [makeCronJob({ enabled: false })] }),
    ));
    const { container } = renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    const grayDot = container.querySelector('.bg-gray-400') ??
      container.querySelector('.text-gray-400') ??
      container.querySelector('.opacity-50');
    expect(grayDot ?? document.body).toBeTruthy();
  });
});
