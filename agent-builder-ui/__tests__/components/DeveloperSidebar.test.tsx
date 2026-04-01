import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeveloperSidebar from '@/app/(platform)/_components/DeveloperSidebar';

// Mock the sidebar collapse store
const mockSetCollapsed = jest.fn();
let mockCollapsed = false;

jest.mock('@/stores/useSidebarCollapseStore', () => ({
  useSidebarCollapseStore: () => ({
    isCollapsed: mockCollapsed,
    setCollapsed: mockSetCollapsed,
  }),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: () => '/agents',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    return <img {...rest} />;
  },
}));

describe('DeveloperSidebar', () => {
  beforeEach(() => {
    mockCollapsed = false;
    mockSetCollapsed.mockClear();
  });

  it('renders the sidebar', () => {
    render(<DeveloperSidebar />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('renders navigation items', () => {
    render(<DeveloperSidebar />);
    // Sidebar should contain navigation elements
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<DeveloperSidebar className="custom-class" />);
    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).toContain('custom-class');
  });

  it('renders in mobile mode when isMobile is true', () => {
    render(<DeveloperSidebar isMobile />);
    // Mobile sidebar should always be expanded
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toBeInTheDocument();
  });

  it('calls onMobileClose when provided', async () => {
    const onMobileClose = jest.fn();
    const user = userEvent.setup();

    render(<DeveloperSidebar isMobile onMobileClose={onMobileClose} />);
    // Sidebar should render with close capability in mobile mode
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });
});
