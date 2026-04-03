import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../helpers/server';
import MarketplacePage from '@/app/marketplace/page';

const BASE = 'http://localhost:8000';

describe('MarketplacePage', () => {
  test('renders marketplace heading', async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    render(<MarketplacePage />);
    expect(screen.getByText('Discover deployable digital employees')).toBeInTheDocument();
  });

  test('displays listings from API', async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, () =>
        HttpResponse.json({
          items: [
            { id: '1', title: 'Google Ads Agent', slug: 'google-ads', summary: 'Manages ad campaigns', category: 'marketing', installCount: 42, avgRating: 4.5, iconUrl: null },
            { id: '2', title: 'HR Bot', slug: 'hr-bot', summary: 'Answers HR questions', category: 'hr', installCount: 10, avgRating: 0, iconUrl: null },
          ],
        }),
      ),
    );
    render(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByText('Google Ads Agent')).toBeInTheDocument();
      expect(screen.getByText('HR Bot')).toBeInTheDocument();
    });
  });

  test('shows loading state', () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    render(<MarketplacePage />);
    expect(screen.getByText('Loading marketplace...')).toBeInTheDocument();
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

  test('displays install count and rating', async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, () =>
        HttpResponse.json({
          items: [
            { id: '1', title: 'Test Agent', slug: 'test', summary: 'A test', category: 'general', installCount: 99, avgRating: 4.2, iconUrl: null },
          ],
        }),
      ),
    );
    render(<MarketplacePage />);
    await waitFor(() => {
      expect(screen.getByText('99 installs')).toBeInTheDocument();
      expect(screen.getByText(/4\.2/)).toBeInTheDocument();
    });
  });

  test('sends category filter in API request', async () => {
    let requestUrl = '';
    server.use(
      http.get(`${BASE}/api/marketplace/listings`, ({ request }) => {
        requestUrl = request.url;
        return HttpResponse.json({ items: [] });
      }),
    );
    render(<MarketplacePage />);
    await waitFor(() => expect(screen.queryByText('Loading marketplace...')).not.toBeInTheDocument());

    const select = screen.getByDisplayValue('All Categories');
    await userEvent.selectOptions(select, 'marketing');

    await waitFor(() => expect(requestUrl).toContain('category=marketing'));
  });
});
