import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInput from '@/app/(platform)/agents/create/_components/ChatInput';

describe('ChatInput', () => {
  const onSend = jest.fn();

  beforeEach(() => {
    onSend.mockClear();
  });

  it('renders the textarea with placeholder', () => {
    render(<ChatInput onSend={onSend} placeholder="Type here..." />);
    expect(screen.getByPlaceholderText('Type here...')).toBeInTheDocument();
  });

  it('renders with default placeholder when none provided', () => {
    render(<ChatInput onSend={onSend} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onSend with trimmed message on Enter', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Build me an email agent');
    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledWith('Build me an email agent');
  });

  it('does not send empty messages', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.keyboard('{Enter}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('allows newline with Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Line 1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables input when disabled prop is true', () => {
    render(<ChatInput onSend={onSend} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('clears input after sending', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello');
    await user.keyboard('{Enter}');

    expect(textarea).toHaveValue('');
  });
});
