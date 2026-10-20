import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { ScanTarget } from '@/components/kiosk/ScanTarget';

describe('ScanTarget', () => {
  it('submits the typed value when Enter is pressed and clears the input', () => {
    const onSubmit = vi.fn();
    const ref = createRef<HTMLInputElement>();
    render(<ScanTarget inputRef={ref} isSubmitting={false} onSubmit={onSubmit} />);

    const input = screen.getByLabelText('Scanner input');
    fireEvent.change(input, { target: { value: '{"ticketId":"t1","signature":"sig"}' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('{"ticketId":"t1","signature":"sig"}');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('does not submit on other key presses', () => {
    const onSubmit = vi.fn();
    const ref = createRef<HTMLInputElement>();
    render(<ScanTarget inputRef={ref} isSubmitting={false} onSubmit={onSubmit} />);

    fireEvent.keyDown(screen.getByLabelText('Scanner input'), { key: 'a' });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the input while a scan is being submitted', () => {
    const ref = createRef<HTMLInputElement>();
    render(<ScanTarget inputRef={ref} isSubmitting={true} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Scanner input')).toBeDisabled();
    expect(screen.getByText('Checking ticket…')).toBeInTheDocument();
  });
});
