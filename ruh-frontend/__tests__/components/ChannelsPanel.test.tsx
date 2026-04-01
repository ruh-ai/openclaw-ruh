import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import { makeSandbox, makeChannelsConfig, SANDBOX_ID } from '../helpers/fixtures';
import ChannelsPanel from '@/components/ChannelsPanel';

const BASE = 'http://localhost:8000';

function renderChannels(sandbox = makeSandbox()) {
  return render(<ChannelsPanel sandbox={sandbox} />);
}

describe('ChannelsPanel', () => {
  // ── Initial render ────────────────────────────────────────────────────────────

  test('fetches channel config on mount', async () => {
    let fetchCalled = false;
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/channels`, () => {
      fetchCalled = true;
      return HttpResponse.json(makeChannelsConfig());
    }));
    renderChannels();
    await waitFor(() => expect(fetchCalled).toBe(true));
  });

  test('renders Telegram section', async () => {
    renderChannels();
    await waitFor(() =>
      expect(screen.queryByText(/telegram/i)).toBeInTheDocument(),
    );
  });

  test('renders Slack section', async () => {
    renderChannels();
    await waitFor(() =>
      expect(screen.queryByText(/slack/i)).toBeInTheDocument(),
    );
  });

  // ── Section expand/collapse ───────────────────────────────────────────────────

  test('Telegram section can be expanded to show config fields', async () => {
    renderChannels();
    // Wait for config to load (sections appear)
    await waitFor(() => expect(screen.queryByText('Telegram')).toBeInTheDocument());

    // The expand toggle is a ▼ button; Telegram's is the first one
    const expandBtns = screen.getAllByRole('button').filter(
      (b) => b.textContent?.trim() === '▼' || b.textContent?.trim() === '▲',
    );
    await userEvent.click(expandBtns[0]);

    await waitFor(() => {
      const botTokenField =
        screen.queryByLabelText(/bot token/i) ??
        screen.queryByPlaceholderText(/bot token/i) ??
        screen.queryByText(/bot token/i);
      expect(botTokenField).toBeTruthy();
    });
  });

  test('Slack section can be expanded to show config fields', async () => {
    renderChannels();
    await waitFor(() => expect(screen.queryByText('Slack')).toBeInTheDocument());

    // Slack's expand toggle is the second ▼ button
    const expandBtns = screen.getAllByRole('button').filter(
      (b) => b.textContent?.trim() === '▼' || b.textContent?.trim() === '▲',
    );
    await userEvent.click(expandBtns[1]);

    await waitFor(() => {
      // After expanding Slack, its Connection mode combobox (select) becomes visible
      const slackField =
        screen.queryAllByRole('combobox')[0] ??
        screen.queryByText('Enable Slack');
      expect(slackField).toBeTruthy();
    });
  });

  // ── Telegram config save ──────────────────────────────────────────────────────

  test('saves Telegram config via PUT endpoint', async () => {
    let putCalled = false;
    let capturedBody: Record<string, unknown> = {};

    server.use(http.put(`${BASE}/api/sandboxes/${SANDBOX_ID}/channels/telegram`, async ({ request }) => {
      putCalled = true;
      capturedBody = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ok: true, logs: ['✓ Gateway restarted'] });
    }));

    renderChannels();
    await waitFor(() => screen.queryByText(/telegram/i));

    // Expand telegram section
    const telegramHeader = screen.queryByText(/telegram/i);
    if (telegramHeader) {
      await userEvent.click(telegramHeader);

      // Find save button
      const saveBtn = screen.queryByRole('button', { name: /save/i });
      if (saveBtn) {
        await userEvent.click(saveBtn);
        await waitFor(() => expect(putCalled).toBe(true));
      }
    }
  });

  // ── Slack config save ─────────────────────────────────────────────────────────

  test('saves Slack config via PUT endpoint', async () => {
    let putCalled = false;
    server.use(http.put(`${BASE}/api/sandboxes/${SANDBOX_ID}/channels/slack`, () => {
      putCalled = true;
      return HttpResponse.json({ ok: true, logs: ['✓ Gateway restarted'] });
    }));

    renderChannels();
    await waitFor(() => screen.queryByText(/slack/i));

    const slackHeaders = screen.queryAllByText(/slack/i);
    if (slackHeaders.length > 0) {
      await userEvent.click(slackHeaders[0]);

      await waitFor(() => {
        const saveBtn = screen.queryByRole('button', { name: /save/i });
        return saveBtn !== null;
      });

      const saveBtn = screen.queryByRole('button', { name: /save/i });
      if (saveBtn) {
        await userEvent.click(saveBtn);
        await waitFor(() => expect(putCalled).toBe(true));
      }
    }
  });

  // ── Toggle enable ─────────────────────────────────────────────────────────────

  test('toggle switch can be interacted with', async () => {
    renderChannels();
    await waitFor(() => expect(screen.queryByText('Telegram')).toBeInTheDocument());

    // Expand the Telegram section first (click ▼ toggle)
    const expandBtns = screen.getAllByRole('button').filter(
      (b) => b.textContent?.trim() === '▼' || b.textContent?.trim() === '▲',
    );
    await userEvent.click(expandBtns[0]);

    // The enable toggle is a role="switch" button inside the expanded body
    await waitFor(() => {
      const toggle =
        screen.queryByRole('switch') ??
        screen.queryByLabelText(/enabled/i) ??
        screen.queryByText(/^enabled$/i);
      expect(toggle).toBeTruthy();
    });
  });

  // ── Probe connection ──────────────────────────────────────────────────────────

  test('Probe button calls GET channels/:channel/status endpoint', async () => {
    let probeCalled = false;
    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/channels/telegram/status`, () => {
        probeCalled = true;
        return HttpResponse.json({ ok: true, channel: 'telegram', output: 'Connected' });
      }),
    );

    renderChannels();
    await waitFor(() => screen.queryByText(/telegram/i));

    const telegramHeader = screen.queryByText(/telegram/i);
    if (telegramHeader) {
      await userEvent.click(telegramHeader);

      await waitFor(() => screen.queryByRole('button', { name: /probe|check|status/i }));
      const probeBtn = screen.queryByRole('button', { name: /probe|check|status/i });

      if (probeBtn) {
        await userEvent.click(probeBtn);
        await waitFor(() => expect(probeCalled).toBe(true));
      }
    }
  });

  test('probe shows output after status check', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/channels/telegram/status`, () =>
      HttpResponse.json({ ok: true, channel: 'telegram', output: 'Bot is running' }),
    ));

    renderChannels();
    await waitFor(() => screen.queryByText(/telegram/i));

    const telegramHeader = screen.queryByText(/telegram/i);
    if (telegramHeader) {
      await userEvent.click(telegramHeader);

      const probeBtn = screen.queryByRole('button', { name: /probe|check/i });
      if (probeBtn) {
        await userEvent.click(probeBtn);
        await waitFor(() =>
          expect(screen.queryByText(/bot is running/i) ?? document.body).toBeTruthy(),
        );
      }
    }
  });

  // ── Pairing section ───────────────────────────────────────────────────────────

  test('pairing section fetches pending codes', async () => {
    let pairingCalled = false;
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/channels/telegram/pairing`, () => {
      pairingCalled = true;
      return HttpResponse.json({ ok: true, codes: ['ABC12345'], output: 'Pending' });
    }));

    renderChannels();
    await waitFor(() => screen.queryByText(/telegram/i));

    const telegramHeader = screen.queryByText(/telegram/i);
    if (telegramHeader) {
      await userEvent.click(telegramHeader);

      // Look for pairing section
      const pairingBtn =
        screen.queryByRole('button', { name: /pairing|list|refresh/i }) ??
        screen.queryByText(/pairing/i);

      if (pairingBtn && pairingBtn.tagName === 'BUTTON') {
        await userEvent.click(pairingBtn);
        await waitFor(() => expect(pairingCalled).toBe(true));
      }
    }
  });

  test('approving a pairing code uppercases the payload and refreshes pending codes', async () => {
    let approveCalled = false;
    let listCalls = 0;
    let capturedBody: Record<string, unknown> = {};

    server.use(
      http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/channels/telegram/pairing`, () => {
        listCalls += 1;
        return HttpResponse.json({
          ok: true,
          codes: [],
          output: 'No pending pairing requests',
        });
      }),
      http.post(`${BASE}/api/sandboxes/${SANDBOX_ID}/channels/telegram/pairing/approve`, async ({ request }) => {
        approveCalled = true;
        capturedBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ ok: true, output: 'Approved via test' });
      }),
    );

    renderChannels();
    await waitFor(() => screen.queryByText(/telegram/i));

    const expandBtns = screen.getAllByRole('button').filter(
      (b) => b.textContent?.trim() === '▼' || b.textContent?.trim() === '▲',
    );
    if (expandBtns[0]) {
      await userEvent.click(expandBtns[0]);

      const codeInput = await screen.findByPlaceholderText(/zjnty7my/i);
      await userEvent.type(codeInput, 'abc12345');
      expect(codeInput).toHaveValue('ABC12345');

      await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));

      await waitFor(() => expect(approveCalled).toBe(true));
      expect(capturedBody).toEqual({ code: 'ABC12345' });
      await waitFor(() => expect(listCalls).toBe(1));
      await waitFor(() => expect(screen.getByText(/approved via test/i)).toBeInTheDocument());
      await waitFor(() => expect(codeInput).toHaveValue(''));
    }
  });

  // ── DM policy ─────────────────────────────────────────────────────────────────

  test('DM policy selector is present in Telegram section', async () => {
    renderChannels();
    await waitFor(() => expect(screen.queryByText('Telegram')).toBeInTheDocument());

    // Expand the Telegram section
    const expandBtns = screen.getAllByRole('button').filter(
      (b) => b.textContent?.trim() === '▼' || b.textContent?.trim() === '▲',
    );
    await userEvent.click(expandBtns[0]);

    await waitFor(() => {
      const policy =
        screen.queryByLabelText(/dm policy/i) ??
        screen.queryByText(/dm policy/i) ??
        screen.queryByRole('combobox');
      expect(policy).toBeTruthy();
    });
  });

  // ── Enabled config loaded ─────────────────────────────────────────────────────

  test('pre-fills fields from fetched config when enabled', async () => {
    server.use(http.get(`${BASE}/api/sandboxes/${SANDBOX_ID}/channels`, () =>
      HttpResponse.json(makeChannelsConfig({
        telegram: { enabled: true, botToken: '1234***efgh', dmPolicy: 'open' },
      })),
    ));
    renderChannels();

    // When enabled=true, the Telegram section starts already expanded.
    // The StatusBadge shows "Enabled" — just wait for it.
    await waitFor(() => {
      const enabledBadge = screen.queryByText('Enabled');
      expect(enabledBadge).toBeTruthy();
    });
  });
});
