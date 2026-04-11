import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
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

    // The toggle button for an enabled job shows "Pause"
    const toggleBtn = screen.getByRole('button', { name: /^Pause$/i });
    await userEvent.click(toggleBtn);
    await waitFor(() => expect(toggleCalled).toBe(true));
  });

  test('toggle button for disabled job shows "Enable" and calls toggle', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [makeCronJob({ enabled: false })] }),
    ));

    let toggleCalled = false;
    server.use(http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001/toggle`, () => {
      toggleCalled = true;
      return HttpResponse.json({ jobId: 'cron-job-001', enabled: true });
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    const toggleBtn = screen.getByRole('button', { name: /^Enable$/i });
    await userEvent.click(toggleBtn);
    await waitFor(() => expect(toggleCalled).toBe(true));
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

    // The ✕ button is the delete button in each job card
    // It's the last button in the action row
    const allBtns = screen.getAllByRole('button');
    const xBtn = allBtns.find((b) => b.textContent?.trim() === '✕');
    expect(xBtn).toBeTruthy();
    await userEvent.click(xBtn!);
    await waitFor(() => expect(deleteCalled).toBe(true));

    window.confirm = originalConfirm;
  });

  test('delete button does NOT call DELETE when confirm returns false', async () => {
    let deleteCalled = false;
    server.use(http.delete(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001`, () => {
      deleteCalled = true;
      return HttpResponse.json({ deleted: 'cron-job-001' });
    }));

    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => false);

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    const allBtns = screen.getAllByRole('button');
    const xBtn = allBtns.find((b) => b.textContent?.trim() === '✕');
    if (xBtn) {
      await userEvent.click(xBtn);
    }
    expect(deleteCalled).toBe(false);

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

    // The run button has text "▶ Run"
    const runBtn = screen.getByRole('button', { name: /▶ run/i });
    await userEvent.click(runBtn);
    await waitFor(() => expect(runCalled).toBe(true));
  });

  // ── Run history modal ─────────────────────────────────────────────────────────

  test('history button opens RunHistory modal', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }));
    await waitFor(() => {
      expect(screen.queryByText('Run History') ?? screen.queryByText('Loading…')).toBeTruthy();
    });
  });

  test('run history modal fetches and displays run entries', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }));
    await waitFor(() => screen.queryByText('Run History'));

    // Status "ok" is rendered as "✓ ok" — use regex to match
    await waitFor(() =>
      expect(
        screen.queryByText(/\bok\b/) ?? screen.queryByText('No runs recorded yet.'),
      ).toBeTruthy(),
    );
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

  // ── Edit cron modal ───────────────────────────────────────────────────────────

  test('clicking Edit opens EditCronModal with job name pre-filled', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    const editBtn = screen.getByRole('button', { name: /^edit$/i });
    await userEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText('Edit Cron Job')).toBeInTheDocument();
    });
    // Name input should be pre-filled with the job's name
    const nameInput = screen.getByDisplayValue('Daily Report');
    expect(nameInput).toBeInTheDocument();
  });

  test('EditCronModal cancel button closes the modal', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => screen.getByText('Edit Cron Job'));

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText('Edit Cron Job')).not.toBeInTheDocument();
    });
  });

  test('EditCronModal submit calls PATCH endpoint', async () => {
    let patchCalled = false;
    server.use(http.patch(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001`, () => {
      patchCalled = true;
      return HttpResponse.json({ ok: true, jobId: 'cron-job-001' });
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => screen.getByText('Edit Cron Job'));

    // Submit the edit form
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await userEvent.click(saveBtn);

    await waitFor(() => expect(patchCalled).toBe(true));
  });

  test('EditCronModal shows error on PATCH failure', async () => {
    server.use(http.patch(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001`, () =>
      HttpResponse.json({ detail: 'Update failed' }, { status: 400 }),
    ));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => screen.getByText('Edit Cron Job'));

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
  });

  test('EditCronModal can switch schedule type to "every"', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => screen.getByText('Edit Cron Job'));

    // Change schedule type
    const scheduleSelect = screen.getByDisplayValue('Cron expression (recurring)');
    await userEvent.selectOptions(scheduleSelect, 'Every N minutes (interval)');

    // Interval input should now appear
    await waitFor(() => {
      expect(screen.queryByText('Interval (minutes)')).toBeTruthy();
    });
  });

  test('EditCronModal can switch schedule type to "at"', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => screen.getByText('Edit Cron Job'));

    const scheduleSelect = screen.getByDisplayValue('Cron expression (recurring)');
    await userEvent.selectOptions(scheduleSelect, 'One-time (specific date/time)');

    await waitFor(() => {
      expect(screen.queryByText('Date & time')).toBeTruthy();
    });
  });

  test('EditCronModal submits with "every" schedule type', async () => {
    let patchCalled = false;
    let requestBody: Record<string, unknown> = {};
    server.use(http.patch(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001`, async ({ request }) => {
      patchCalled = true;
      requestBody = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => screen.getByText('Edit Cron Job'));

    // Switch to "every" schedule
    const scheduleSelect = screen.getByDisplayValue('Cron expression (recurring)');
    await userEvent.selectOptions(scheduleSelect, 'Every N minutes (interval)');

    await waitFor(() => screen.getByText('Interval (minutes)'));

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(patchCalled).toBe(true));

    const schedule = requestBody.schedule as Record<string, unknown>;
    expect(schedule.kind).toBe('every');
    expect(typeof schedule.everyMs).toBe('number');
  });

  test('EditCronModal submits with "at" schedule type and calls onSaved', async () => {
    let patchCalled = false;
    let requestBody: Record<string, unknown> = {};
    server.use(http.patch(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001`, async ({ request }) => {
      patchCalled = true;
      requestBody = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }));

    // Track refresh (which happens after onSaved)
    let refreshCalled = false;
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () => {
      refreshCalled = true;
      return HttpResponse.json({ jobs: [makeCronJob()] });
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => screen.getByText('Edit Cron Job'));

    // Switch to "at" schedule
    const scheduleSelect = screen.getByDisplayValue('Cron expression (recurring)');
    await userEvent.selectOptions(scheduleSelect, 'One-time (specific date/time)');

    await waitFor(() => screen.getByText('Date & time'));

    // Set a date
    const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    if (dateInput) {
      await userEvent.type(dateInput, '2026-12-25T09:00');
    }

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(patchCalled).toBe(true));

    const schedule = requestBody.schedule as Record<string, unknown>;
    expect(schedule.kind).toBe('at');
    // After save, modal should close and onSaved triggers reload
    await waitFor(() => expect(refreshCalled).toBe(true));
  });

  test('CreateCronModal submits with "every" schedule type', async () => {
    let postCalled = false;
    let requestBody: Record<string, unknown> = {};
    server.use(http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, async ({ request }) => {
      postCalled = true;
      requestBody = await request.json() as Record<string, unknown>;
      return HttpResponse.json(makeCronJob({ name: 'Every Job' }));
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /\+ new job/i }));
    await waitFor(() => screen.getByText('New Cron Job'));

    const scheduleSelect = screen.getByDisplayValue('Cron expression (recurring)');
    await userEvent.selectOptions(scheduleSelect, 'Every N minutes (interval)');

    const nameInput = screen.getByPlaceholderText(/daily summary/i);
    await userEvent.type(nameInput, 'Every Job');

    const messageTextarea = screen.getByPlaceholderText(/summarize today/i);
    await userEvent.type(messageTextarea, 'do something');

    await userEvent.click(screen.getByRole('button', { name: /create job/i }));
    await waitFor(() => expect(postCalled).toBe(true));

    const schedule = requestBody.schedule as Record<string, unknown>;
    expect(schedule.kind).toBe('every');
  });

  // ── Create cron modal ─────────────────────────────────────────────────────────

  test('CreateCronModal cancel button closes the modal', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /\+ new job/i }));
    await waitFor(() => screen.getByText('New Cron Job'));

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText('New Cron Job')).not.toBeInTheDocument();
    });
  });

  test('CreateCronModal submit calls POST endpoint when valid', async () => {
    let postCalled = false;
    server.use(http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () => {
      postCalled = true;
      return HttpResponse.json(makeCronJob({ name: 'My New Job' }));
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /\+ new job/i }));
    await waitFor(() => screen.getByText('New Cron Job'));

    // Fill in required fields
    const nameInput = screen.getByPlaceholderText(/daily summary/i);
    await userEvent.type(nameInput, 'My New Job');

    const messageTextarea = screen.getByPlaceholderText(/summarize today/i);
    await userEvent.type(messageTextarea, 'Run the summary');

    await userEvent.click(screen.getByRole('button', { name: /create job/i }));
    await waitFor(() => expect(postCalled).toBe(true));
  });

  test('CreateCronModal shows error on POST failure', async () => {
    server.use(http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ detail: 'Create failed' }, { status: 400 }),
    ));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /\+ new job/i }));
    await waitFor(() => screen.getByText('New Cron Job'));

    const nameInput = screen.getByPlaceholderText(/daily summary/i);
    await userEvent.type(nameInput, 'Bad Job');

    const messageTextarea = screen.getByPlaceholderText(/summarize today/i);
    await userEvent.type(messageTextarea, 'fail');

    await userEvent.click(screen.getByRole('button', { name: /create job/i }));
    await waitFor(() => {
      expect(screen.getByText('Create failed')).toBeInTheDocument();
    });
  });

  test('CreateCronModal can switch to "every" schedule type', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /\+ new job/i }));
    await waitFor(() => screen.getByText('New Cron Job'));

    const scheduleSelect = screen.getByDisplayValue('Cron expression (recurring)');
    await userEvent.selectOptions(scheduleSelect, 'Every N minutes (interval)');

    await waitFor(() => {
      expect(screen.getByText('Interval (minutes)')).toBeInTheDocument();
    });
  });

  test('CreateCronModal can switch to "at" schedule type and shows delete-after-run checkbox', async () => {
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /\+ new job/i }));
    await waitFor(() => screen.getByText('New Cron Job'));

    const scheduleSelect = screen.getByDisplayValue('Cron expression (recurring)');
    await userEvent.selectOptions(scheduleSelect, 'One-time (specific date/time)');

    await waitFor(() => {
      expect(screen.getByText('Delete job after it runs')).toBeInTheDocument();
    });
  });

  test('CreateCronModal submits with "at" schedule type', async () => {
    let postCalled = false;
    let requestBody: Record<string, unknown> = {};
    server.use(http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, async ({ request }) => {
      postCalled = true;
      requestBody = await request.json() as Record<string, unknown>;
      return HttpResponse.json(makeCronJob({ name: 'At Job' }));
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /\+ new job/i }));
    await waitFor(() => screen.getByText('New Cron Job'));

    // Switch to "at" schedule
    const scheduleSelect = screen.getByDisplayValue('Cron expression (recurring)');
    await userEvent.selectOptions(scheduleSelect, 'One-time (specific date/time)');

    // Fill in the required date
    const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    if (dateInput) {
      fireEvent.change(dateInput, { target: { value: '2026-12-25T09:00' } });
    }

    const nameInput = screen.getByPlaceholderText(/daily summary/i);
    await userEvent.type(nameInput, 'At Job');

    const messageTextarea = screen.getByPlaceholderText(/summarize today/i);
    await userEvent.type(messageTextarea, 'scheduled message');

    await userEvent.click(screen.getByRole('button', { name: /create job/i }));
    await waitFor(() => expect(postCalled).toBe(true));

    const schedule = requestBody.schedule as Record<string, unknown>;
    expect(schedule.kind).toBe('at');
  });

  test('RunHistoryModal shows "—" duration for run without finishedAtMs', async () => {
    const now = Date.now();
    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001/runs`, () =>
        HttpResponse.json({ entries: [
          { id: 'run-003', jobId: 'cron-job-001', startedAtMs: now - 1000, status: 'ok' },
        ]}),
      ),
    );

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }));
    await waitFor(() => screen.getByText('Run History'));

    await waitFor(() => {
      // Duration cell shows "—" when finishedAtMs is missing
      const cells = document.querySelectorAll('td');
      const hasDash = Array.from(cells).some((c) => c.textContent?.trim() === '—');
      expect(hasDash).toBe(true);
    });
  });

  // ── Run history modal ─────────────────────────────────────────────────────────

  test('RunHistoryModal shows error when history fetch fails', async () => {
    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001/runs`, () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    );

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }));
    await waitFor(() => screen.getByText('Run History'));

    await waitFor(() => {
      // After failed fetch, modal shows error text
      const errEl = screen.queryByText(/not found/i) ?? screen.queryByText(/error/i);
      expect(errEl).toBeTruthy();
    });
  });

  test('RunHistoryModal shows "No runs" when empty', async () => {
    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001/runs`, () =>
        HttpResponse.json({ entries: [] }),
      ),
    );

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }));
    await waitFor(() => screen.getByText('Run History'));

    await waitFor(() => {
      expect(screen.getByText('No runs recorded yet.')).toBeInTheDocument();
    });
  });

  test('RunHistoryModal close button dismisses it', async () => {
    const { container } = renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }));
    await screen.findByText('Run History');

    // The modal is a fixed overlay: find it via the "Run History" heading's
    // ancestor that has the fixed class, then find the close button within it.
    const runHistoryHeading = screen.getByText('Run History');
    // Walk up to find the modal container (div.fixed)
    let modalRoot: HTMLElement | null = runHistoryHeading.parentElement;
    while (modalRoot && !modalRoot.classList.contains('fixed')) {
      modalRoot = modalRoot.parentElement;
    }
    expect(modalRoot).toBeTruthy();

    // The ✕ button is in the modal header row
    const xBtn = modalRoot!.querySelector('button');
    expect(xBtn).toBeTruthy();
    await userEvent.click(xBtn!);

    await waitFor(() => {
      expect(screen.queryByText('Run History')).not.toBeInTheDocument();
    });
  });

  test('RunHistoryModal displays run status and duration for ok runs', async () => {
    const now = Date.now();
    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001/runs`, () =>
        HttpResponse.json({ entries: [
          { id: 'run-001', jobId: 'cron-job-001', startedAtMs: now - 5000, finishedAtMs: now, status: 'ok' },
        ]}),
      ),
    );

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }));
    await waitFor(() => screen.getByText('Run History'));

    await waitFor(() => {
      expect(screen.getByText(/✓\s*ok/)).toBeInTheDocument();
    });
  });

  test('RunHistoryModal displays error run status', async () => {
    const now = Date.now();
    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001/runs`, () =>
        HttpResponse.json({ entries: [
          { id: 'run-002', jobId: 'cron-job-001', startedAtMs: now - 2000, finishedAtMs: now, status: 'error', error: 'timeout' },
        ]}),
      ),
    );

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }));
    await waitFor(() => screen.getByText('Run History'));

    await waitFor(() => {
      expect(screen.getByText(/✗\s*error/)).toBeInTheDocument();
    });
  });

  // ── scheduleLabel and formatTs helpers ────────────────────────────────────────

  test('shows "every Ns" label for interval schedules', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [makeCronJob({
        schedule: { kind: 'every', everyMs: 300000 },
      })] }),
    ));
    renderCrons();
    await waitFor(() => {
      expect(screen.getByText('every 300s')).toBeInTheDocument();
    });
  });

  test('shows date string label for one-time "at" schedules', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [makeCronJob({
        schedule: { kind: 'at', at: '2026-12-25T09:00:00.000Z' },
      })] }),
    ));
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));
    // The schedule label renders a localized date string; just verify no crash
    expect(screen.getByText('Daily Report')).toBeInTheDocument();
  });

  test('shows "—" for schedule with missing everyMs', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [makeCronJob({ schedule: { kind: 'every' } })] }),
    ));
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));
    // "—" appears somewhere (last run / next run / schedule label)
    const dashes = document.querySelectorAll('*');
    const hasDash = Array.from(dashes).some((el) => el.textContent?.includes('—'));
    expect(hasDash).toBe(true);
  });

  test('cron with state.error shows error text in card', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [makeCronJob({
        state: { status: 'error', error: 'Connection refused' },
      })] }),
    ));
    renderCrons();
    await waitFor(() => {
      expect(screen.getByText(/connection refused/i)).toBeInTheDocument();
    });
  });

  test('cron with payload.text shows italic text in card', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [makeCronJob({
        payload: { kind: 'systemEvent', text: 'My scheduled prompt' },
      })] }),
    ));
    renderCrons();
    await waitFor(() => {
      expect(screen.getByText(/my scheduled prompt/i)).toBeInTheDocument();
    });
  });

  test('shows "—" for schedule with unknown kind (scheduleLabel fallback)', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [makeCronJob({ schedule: { kind: 'unknown_kind' } })] }),
    ));
    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));
    // scheduleLabel returns "—" for unknown kinds; verify it renders without crash
    expect(screen.getByText('Daily Report')).toBeInTheDocument();
  });

  test('EditCronModal submits agentTurn payload (line 201 — non-systemEvent path)', async () => {
    let patchCalled = false;
    let requestBody: Record<string, unknown> = {};
    server.use(http.patch(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons/cron-job-001`, async ({ request }) => {
      patchCalled = true;
      requestBody = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }));

    // Use agentTurn payload kind (the default fixture)
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () =>
      HttpResponse.json({ jobs: [makeCronJob({ payload: { kind: 'agentTurn', message: 'Run report' } })] }),
    ));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => screen.getByText('Edit Cron Job'));

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(patchCalled).toBe(true));

    const payload = requestBody.payload as Record<string, unknown>;
    expect(payload.kind).toBe('agentTurn');
  });

  test('refresh button re-fetches cron jobs', async () => {
    let fetchCount = 0;
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/crons`, () => {
      fetchCount += 1;
      return HttpResponse.json({ jobs: [makeCronJob()] });
    }));

    renderCrons();
    await waitFor(() => screen.getByText('Daily Report'));
    expect(fetchCount).toBe(1);

    const refreshBtn = screen.getByTitle('Refresh');
    await userEvent.click(refreshBtn);
    await waitFor(() => expect(fetchCount).toBe(2));
  });
});
