import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '@/app/settings/page';

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('renders loading state before localStorage is read', () => {
    const { container } = render(<SettingsPage />);
    expect(container.textContent).toContain('Loading settings...');
  });

  test('renders settings form after mount', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument());
    expect(screen.getByText('Application preferences')).toBeInTheDocument();
  });

  test('loads default settings when none stored', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const input = screen.getByDisplayValue('http://localhost:8000');
      expect(input).toBeInTheDocument();
    });
  });

  test('loads stored settings from localStorage', async () => {
    localStorage.setItem(
      'ruh-settings',
      JSON.stringify({ backend_url: 'http://custom:9000', auto_connect: false, theme: 'dark' }),
    );
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('http://custom:9000')).toBeInTheDocument();
    });
  });

  test('saves settings to localStorage', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText('Save Settings')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => expect(screen.getByText('Saved!')).toBeInTheDocument());

    const stored = JSON.parse(localStorage.getItem('ruh-settings')!);
    expect(stored.backend_url).toBe('http://localhost:8000');
  });

  test('test connection succeeds', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true });

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Test'));
    await waitFor(() =>
      expect(screen.getByText('Connected successfully')).toBeInTheDocument(),
    );

    globalThis.fetch = originalFetch;
  });

  test('test connection fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network'));

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Test'));
    await waitFor(() =>
      expect(screen.getByText('Connection failed')).toBeInTheDocument(),
    );

    globalThis.fetch = originalFetch;
  });
});
