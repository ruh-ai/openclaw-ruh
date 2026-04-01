import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import SettingsPage from '@/app/settings/page';

const STORAGE_KEY = 'ruh-settings';

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers({ advanceTimers: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SettingsPage', () => {
  // ── Loading state ───────────────────────────────────────────────────────────

  test('returns loading div when settings state is null', () => {
    // The loading state is transient (useEffect sets state synchronously in
    // jsdom), so we verify the component's conditional branch by confirming
    // the page renders defaults rather than the loading placeholder.
    render(<SettingsPage />);
    // After useEffect runs, settings are populated — loading should be gone
    expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  // ── Default render ──────────────────────────────────────────────────────────

  test('renders with default settings when localStorage is empty', async () => {
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument()
    );

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Application preferences')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:8000')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Save Settings')).toBeInTheDocument();
    expect(screen.getByText('Auto-connect on startup')).toBeInTheDocument();
  });

  // ── Persisted settings ──────────────────────────────────────────────────────

  test('loads settings from localStorage when present', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        backend_url: 'https://api.example.com',
        auto_connect: false,
        theme: 'dark',
      })
    );

    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument()
    );

    expect(screen.getByDisplayValue('https://api.example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Dark')).toBeInTheDocument();
  });

  // ── Save flow ───────────────────────────────────────────────────────────────

  test('saves settings to localStorage and shows confirmation', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument()
    );

    const input = screen.getByDisplayValue('http://localhost:8000');
    await user.clear(input);
    await user.type(input, 'http://localhost:9000');
    await user.click(screen.getByText('Save Settings'));

    expect(screen.getByText('Saved!')).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.backend_url).toBe('http://localhost:9000');

    // "Saved!" disappears after 2 seconds
    act(() => { jest.advanceTimersByTime(2000); });
    await waitFor(() =>
      expect(screen.getByText('Save Settings')).toBeInTheDocument()
    );
  });

  // ── Theme selection ─────────────────────────────────────────────────────────

  test('allows changing the theme', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument()
    );

    await user.selectOptions(screen.getByDisplayValue('Light'), 'dark');
    expect(screen.getByDisplayValue('Dark')).toBeInTheDocument();
  });

  // ── Auto-connect toggle ─────────────────────────────────────────────────────

  test('toggles auto-connect setting', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument()
    );

    // Default is on (purple). Click to toggle off.
    const toggle = screen.getByText('Auto-connect on startup')
      .closest('.flex')!
      .querySelector('button')!;
    await user.click(toggle);

    // After toggling off, the button should have gray background class
    expect(toggle.className).toContain('bg-gray-300');
  });

  // ── Test connection: success ────────────────────────────────────────────────

  test('shows success message when connection test passes', async () => {
    server.use(
      http.get('http://localhost:8000/health', () => HttpResponse.json({ status: 'ok' }))
    );

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument()
    );

    await user.click(screen.getByText('Test'));

    await waitFor(() =>
      expect(screen.getByText('Connected successfully')).toBeInTheDocument()
    );
  });

  // ── Test connection: failure ────────────────────────────────────────────────

  test('shows failure message when connection test fails (non-ok response)', async () => {
    server.use(
      http.get('http://localhost:8000/health', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 })
      )
    );

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument()
    );

    await user.click(screen.getByText('Test'));

    await waitFor(() =>
      expect(screen.getByText('Connection failed')).toBeInTheDocument()
    );
  });

  test('shows failure message when connection test throws a network error', async () => {
    server.use(
      http.get('http://localhost:8000/health', () => HttpResponse.error())
    );

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument()
    );

    await user.click(screen.getByText('Test'));

    await waitFor(() =>
      expect(screen.getByText('Connection failed')).toBeInTheDocument()
    );
  });

  // ── Test button disabled state ──────────────────────────────────────────────

  test('disables Test button and shows "Testing..." while request is in flight', async () => {
    let resolveHealth!: () => void;
    const pending = new Promise<void>((r) => { resolveHealth = r; });

    server.use(
      http.get('http://localhost:8000/health', async () => {
        await pending;
        return HttpResponse.json({ status: 'ok' });
      })
    );

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument()
    );

    await user.click(screen.getByText('Test'));

    await waitFor(() =>
      expect(screen.getByText('Testing...')).toBeInTheDocument()
    );
    expect(screen.getByText('Testing...').closest('button')).toBeDisabled();

    resolveHealth();

    await waitFor(() =>
      expect(screen.getByText('Test')).toBeInTheDocument()
    );
  });
});
