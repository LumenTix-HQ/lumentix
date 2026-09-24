import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScanResultDisplay } from '@/components/kiosk/ScanResultDisplay';

describe('ScanResultDisplay', () => {
  it('shows attendee info and an initials avatar on success', () => {
    render(
      <ScanResultDisplay
        result={{
          outcome: 'success',
          message: 'Checked in',
          attendeeName: 'Ada Lovelace',
          attendeeEmail: 'ada@example.com',
          ticketType: 'vip',
        }}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('Checked In')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument(); // initials avatar
  });

  it('shows the error message on failure, with no attendee photo', () => {
    render(
      <ScanResultDisplay
        result={{ outcome: 'error', message: 'Ticket has already been checked in' }}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('Not Verified')).toBeInTheDocument();
    expect(screen.getByText('Ticket has already been checked in')).toBeInTheDocument();
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
  });

  it('calls onDismiss when tapped', () => {
    const onDismiss = vi.fn();
    render(
      <ScanResultDisplay result={{ outcome: 'success', message: 'Checked in' }} onDismiss={onDismiss} />,
    );

    fireEvent.click(screen.getByRole('status'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
