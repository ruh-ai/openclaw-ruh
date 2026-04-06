import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import Home from '@/app/page';

import { makeCustomerSession, makeInstalledListing } from '../helpers/fixtures';
import { server } from '../helpers/server';

const BASE = 'http://localhost:8000';

describe('Home page', () => {
  test('renders installed agent cards for the active org and user inventory', async () => {
    server.use(
      http.get(`${BASE}/api/auth/me`, () => HttpResponse.json(makeCustomerSession())),
      http.get(`${BASE}/api/marketplace/my/installed-listings`, () =>
        HttpResponse.json({ items: [makeInstalledListing()] }),
      ),
    );

    render(<Home />);

    expect(
      await screen.findByRole('heading', { name: /open the agents already installed for your work/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Acme Customer Org')).toBeInTheDocument();
    expect(screen.getByText('Ruh Customer')).toBeInTheDocument();
    expect(screen.getByText('Sarah Assistant')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open workspace for sarah assistant/i }),
    ).toHaveAttribute('href', '/agents/agent-runtime-001');
  });

  test('does not render sandbox-management entry points on the customer root route', async () => {
    render(<Home />);

    await screen.findByText('Installed agent workspaces');

    expect(screen.queryByText('New Sandbox')).not.toBeInTheDocument();
    expect(screen.queryByText('No sandbox selected')).not.toBeInTheDocument();
  });

  test('renders marketplace empty state when no installed listings exist', async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/my/installed-listings`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );

    render(<Home />);

    expect(await screen.findByText('No installed agents yet')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /browse marketplace/i }),
    ).toHaveAttribute('href', '/marketplace');
  });

  test('surfaces installed-listings errors', async () => {
    server.use(
      http.get(`${BASE}/api/marketplace/my/installed-listings`, () =>
        HttpResponse.json({ detail: 'Customer access required' }, { status: 403 }),
      ),
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Customer access required')).toBeInTheDocument();
    });
  });
});
