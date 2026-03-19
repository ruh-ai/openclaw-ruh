import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SandboxResult, { type SandboxResultData } from '@/components/SandboxResult';

const baseData: SandboxResultData = {
  sandbox_id: 'sb-result-001',
  sandbox_state: 'started',
  dashboard_url: 'https://preview.daytona.io/sb-001',
  signed_url: null,
  standard_url: 'https://preview.daytona.io/sb-001',
  preview_token: 'prev-tok-abc123',
  gateway_token: 'gw-tok-xyz789',
  gateway_port: 18789,
  ssh_command: 'daytona ssh sb-result-001',
  approve_command: 'daytona exec sb-result-001 openclaw devices approve --latest',
};

function renderResult(overrides: Partial<{
  data: Partial<SandboxResultData>;
  approvalStatus: 'waiting' | 'approved' | null;
  onReset: () => void;
}> = {}) {
  const onReset = overrides.onReset ?? jest.fn();
  const data = { ...baseData, ...overrides.data };
  const approvalStatus = overrides.approvalStatus ?? null;
  return render(<SandboxResult data={data} approvalStatus={approvalStatus} onReset={onReset} />);
}

describe('SandboxResult', () => {
  // ── Header ────────────────────────────────────────────────────────────────────

  test('shows "Sandbox Ready" in header', () => {
    renderResult();
    expect(screen.getByText('Sandbox Ready')).toBeInTheDocument();
  });

  test('shows sandbox ID in header', () => {
    renderResult();
    // sandbox_id appears in both the header span and the InfoRow — use getAllByText
    expect(screen.getAllByText('sb-result-001').length).toBeGreaterThan(0);
  });

  test('"Create another" button calls onReset', async () => {
    const onReset = jest.fn();
    renderResult({ onReset });
    await userEvent.click(screen.getByText('Create another'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  // ── Approval status banners ───────────────────────────────────────────────────

  test('shows waiting banner when approvalStatus is "waiting"', () => {
    renderResult({ approvalStatus: 'waiting' });
    expect(screen.getByText('Waiting for device pairing')).toBeInTheDocument();
  });

  test('shows approved banner when approvalStatus is "approved"', () => {
    renderResult({ approvalStatus: 'approved' });
    expect(screen.getByText(/Device approved/)).toBeInTheDocument();
  });

  test('shows no approval banner when approvalStatus is null', () => {
    renderResult({ approvalStatus: null });
    expect(screen.queryByText('Waiting for device pairing')).not.toBeInTheDocument();
    expect(screen.queryByText(/Device approved/)).not.toBeInTheDocument();
  });

  // ── InfoRow fields ────────────────────────────────────────────────────────────

  test('renders Sandbox ID field', () => {
    renderResult();
    expect(screen.getByText('Sandbox ID')).toBeInTheDocument();
    // Value appears twice (header + InfoRow)
    expect(screen.getAllByText('sb-result-001').length).toBeGreaterThanOrEqual(1);
  });

  test('renders State field with sandbox state', () => {
    renderResult();
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getByText('started')).toBeInTheDocument();
  });

  test('renders Dashboard URL field', () => {
    renderResult();
    expect(screen.getByText('Dashboard URL')).toBeInTheDocument();
    expect(screen.getByText('https://preview.daytona.io/sb-001')).toBeInTheDocument();
  });

  test('renders Preview Token with secret styling', () => {
    renderResult();
    expect(screen.getByText('Preview Token')).toBeInTheDocument();
    const tokenEl = screen.getByText('prev-tok-abc123');
    expect(tokenEl).toHaveClass('text-yellow-300');
  });

  test('renders Gateway Token with secret styling', () => {
    renderResult();
    const tokenEl = screen.getByText('gw-tok-xyz789');
    expect(tokenEl).toHaveClass('text-yellow-300');
  });

  test('renders SSH command field', () => {
    renderResult();
    expect(screen.getByText('SSH')).toBeInTheDocument();
    expect(screen.getByText('daytona ssh sb-result-001')).toBeInTheDocument();
  });

  test('does not render row for null field', () => {
    renderResult({ data: { preview_token: null } });
    // Still renders label since gateway_token is present
    expect(screen.queryByText('prev-tok-abc123')).not.toBeInTheDocument();
  });

  // ── Open Dashboard button ─────────────────────────────────────────────────────

  test('renders "Open Dashboard →" link with correct href', () => {
    renderResult();
    const link = screen.getByRole('link', { name: /open dashboard/i });
    expect(link).toHaveAttribute('href', 'https://preview.daytona.io/sb-001');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('does not render dashboard link when dashboard_url is null', () => {
    renderResult({ data: { dashboard_url: null } });
    expect(screen.queryByRole('link', { name: /open dashboard/i })).not.toBeInTheDocument();
  });

  // ── Copy buttons ──────────────────────────────────────────────────────────────

  test('copy button writes value to clipboard and shows "✓"', async () => {
    renderResult();
    const copyBtns = screen.getAllByText('Copy');
    await userEvent.click(copyBtns[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    // At least one button should show ✓ after clicking
    await screen.findByText('✓');
  });

  // ── Next steps ────────────────────────────────────────────────────────────────

  test('renders "Next steps" section', () => {
    renderResult();
    expect(screen.getByText(/next steps/i)).toBeInTheDocument();
  });

  test('renders 4 next-step list items', () => {
    renderResult();
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(4);
  });
});
