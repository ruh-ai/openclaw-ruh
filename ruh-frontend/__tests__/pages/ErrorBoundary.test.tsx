import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockLoggerError = jest.fn();
jest.mock('@/lib/logger', () => ({
  logger: { error: mockLoggerError, info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import ErrorPage from '@/app/error';
import GlobalError from '@/app/global-error';

describe('Error boundary (error.tsx)', () => {
  test('renders error message', () => {
    const error = Object.assign(new Error('Something broke'), { digest: undefined });
    render(<ErrorPage error={error} reset={() => {}} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  test('displays error digest when present', () => {
    const error = Object.assign(new Error('fail'), { digest: 'abc-123' });
    render(<ErrorPage error={error} reset={() => {}} />);
    expect(screen.getByText('Error ID: abc-123')).toBeInTheDocument();
  });

  test('does not show error ID when no digest', () => {
    const error = Object.assign(new Error('fail'), { digest: undefined });
    render(<ErrorPage error={error} reset={() => {}} />);
    expect(screen.queryByText(/Error ID/)).not.toBeInTheDocument();
  });

  test('calls reset when "Try Again" is clicked', async () => {
    const reset = jest.fn();
    const error = Object.assign(new Error('fail'), { digest: undefined });
    render(<ErrorPage error={error} reset={reset} />);
    await userEvent.click(screen.getByText('Try Again'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test('renders Home link', () => {
    const error = Object.assign(new Error('fail'), { digest: undefined });
    render(<ErrorPage error={error} reset={() => {}} />);
    const homeLink = screen.getByText('Home');
    expect(homeLink.closest('a')).toHaveAttribute('href', '/');
  });

  test('logs error via logger on mount', () => {
    mockLoggerError.mockClear();
    const error = Object.assign(new Error('logged'), { digest: 'xyz' });
    render(<ErrorPage error={error} reset={() => {}} />);
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'logged', digest: 'xyz' }),
      'Unhandled error caught by boundary',
    );
  });
});

describe('Global error (global-error.tsx)', () => {
  test('renders Application Error heading', () => {
    const error = Object.assign(new Error('critical'), { digest: undefined });
    render(<GlobalError error={error} reset={() => {}} />);
    expect(screen.getByText('Application Error')).toBeInTheDocument();
  });

  test('displays error digest when present', () => {
    const error = Object.assign(new Error('critical'), { digest: 'global-123' });
    render(<GlobalError error={error} reset={() => {}} />);
    expect(screen.getByText('Error ID: global-123')).toBeInTheDocument();
  });

  test('calls reset when Refresh button is clicked', async () => {
    const reset = jest.fn();
    const error = Object.assign(new Error('critical'), { digest: undefined });
    render(<GlobalError error={error} reset={reset} />);
    await userEvent.click(screen.getByText('Refresh'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test('logs error to console on render', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('global-logged'), { digest: 'g-xyz' });
    render(<GlobalError error={error} reset={() => {}} />);
    expect(spy).toHaveBeenCalledWith(
      '[GlobalError]',
      expect.objectContaining({ message: 'global-logged', digest: 'g-xyz' }),
    );
    spy.mockRestore();
  });
});
