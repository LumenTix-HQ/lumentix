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
});
