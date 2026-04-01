import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import MarketplacePage from '@/app/marketplace/page';

const BASE = 'http://localhost:8000';

const listing = {
  id: 'listing-1',
  title: 'Test Agent',
  slug: 'test-agent',
  summary: 'A test agent',
  category: 'marketing',
  installCount: 42,
  avgRating: 4.5,
  iconUrl: null,
};

describe('MarketplacePage', () => {
  test('shows loading state then renders listings', async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, () =>
        HttpResponse.json({ items: [listing] }),
      ),
    );

    render(<MarketplacePage />);
    expect(screen.getByText('Loading marketplace...')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Test Agent')).toBeInTheDocument());
    expect(screen.queryByText('Loading marketplace...')).not.toBeInTheDocument();
  });

  test('shows empty state when no listings', async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );

    render(<MarketplacePage />);
    await waitFor(() =>
      expect(screen.getByText('No agents published yet')).toBeInTheDocument(),
    );
  });

  test('search input triggers re-fetch with search param', async () => {
    const requestedUrls: string[] = [];
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({ items: [] });
      }),
    );

    render(<MarketplacePage />);
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const searchInput = screen.getByPlaceholderText('Search agents...');
    await userEvent.type(searchInput, 'sales');

    await waitFor(() =>
      expect(requestedUrls.some((u) => u.includes('search=sales'))).toBe(true),
    );
  });

  test('category select triggers re-fetch with category param', async () => {
    const requestedUrls: string[] = [];
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({ items: [] });
      }),
    );

    render(<MarketplacePage />);
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const select = screen.getByDisplayValue('All Categories');
    await userEvent.selectOptions(select, 'marketing');

    await waitFor(() =>
      expect(requestedUrls.some((u) => u.includes('category=marketing'))).toBe(true),
    );
  });

  test('handles API error gracefully (shows empty list)', async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, () =>
        HttpResponse.error(),
      ),
    );

    render(<MarketplacePage />);
    await waitFor(() =>
      expect(screen.getByText('No agents published yet')).toBeInTheDocument(),
    );
  });

  test('handles non-ok response gracefully', async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    render(<MarketplacePage />);
    await waitFor(() =>
      expect(screen.getByText('No agents published yet')).toBeInTheDocument(),
    );
  });

  test('renders listing with icon when iconUrl is set', async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, () =>
        HttpResponse.json({
          items: [{ ...listing, iconUrl: 'https://example.com/icon.png' }],
        }),
      ),
    );

    const { container } = render(<MarketplacePage />);
    await waitFor(() => expect(screen.getByText('Test Agent')).toBeInTheDocument());
    const img = container.querySelector('img[src="https://example.com/icon.png"]');
    expect(img).toBeInTheDocument();
  });
});
