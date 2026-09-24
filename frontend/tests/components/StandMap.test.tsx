import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StandMap from '@/components/venues/StandMap';
import type { Seat } from '@/types/event';

const seats: Seat[] = [
  { id: 's1', sectionId: 'sec', seatIdentifier: 'A1', row: 1, number: 1, status: 'available', heldBy: null },
  { id: 's2', sectionId: 'sec', seatIdentifier: 'A2', row: 1, number: 2, status: 'booked', heldBy: null },
];

describe('StandMap', () => {
  it('renders a button per seat and selects available ones', () => {
    const onSelect = vi.fn();
    render(<StandMap seats={seats} sectionName="Stand" onSelectSeat={onSelect} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTitle('A1 - available'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('disables sold/booked seats', () => {
    render(<StandMap seats={seats} sectionName="Stand" onSelectSeat={() => {}} />);
    expect(screen.getByTitle('A2 - booked')).toBeDisabled();
  });

  // Regression test for #1146: seat sizing must come from a style/class
  // Tailwind (or inline CSS) actually applies, not an interpolated
  // arbitrary-value class name like `w-[${SEAT_SIZE}px]` that the JIT
  // scanner can never see as a literal string.
  it('applies a real width/height to each seat button', () => {
    render(<StandMap seats={seats} sectionName="Stand" onSelectSeat={() => {}} />);
    const seat = screen.getByTitle('A1 - available');
    expect(seat).toHaveStyle({ width: '36px', height: '36px' });
  });
});
