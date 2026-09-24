import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeatMap from '@/components/venues/SeatMap';
import type { Seat } from '@/types/event';

const seats: Seat[] = [
  { id: 's1', sectionId: 'sec', seatIdentifier: 'A1', row: 1, number: 1, status: 'available', heldBy: null },
  { id: 's2', sectionId: 'sec', seatIdentifier: 'A2', row: 1, number: 2, status: 'booked', heldBy: null },
  { id: 's3', sectionId: 'sec', seatIdentifier: 'A3', row: 1, number: 3, status: 'held', heldBy: 'x' },
];

describe('SeatMap', () => {
  it('renders one button per seat', () => {
    render(<SeatMap seats={seats} sectionName="Main" onSelectSeat={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('selecting an available seat invokes onSelectSeat', () => {
    const onSelect = vi.fn();
    render(<SeatMap seats={seats} sectionName="Main" onSelectSeat={onSelect} />);
    fireEvent.click(screen.getByTitle('A1 - available'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('disables booked and held seats and ignores clicks on them', () => {
    const onSelect = vi.fn();
    render(<SeatMap seats={seats} sectionName="Main" onSelectSeat={onSelect} />);
    const booked = screen.getByTitle('A2 - booked');
    const held = screen.getByTitle('A3 - held');
    expect(booked).toHaveAttribute('aria-disabled', 'true');
    expect(held).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(booked);
    fireEvent.click(held);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('supports keyboard activation of an available seat', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SeatMap seats={seats} sectionName="Main" onSelectSeat={onSelect} />);
    const seat = screen.getByTitle('A1 - available');
    seat.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  // Regression test for #1146: seat sizing must come from real SVG geometry,
  // not an interpolated arbitrary-value class name like `w-[${SEAT_SIZE}px]`
  // that the Tailwind JIT scanner can never see as a literal string.
  it('applies a real width/height to each seat', () => {
    render(<SeatMap seats={seats} sectionName="Main" onSelectSeat={() => {}} />);
    const seat = screen.getByTitle('A1 - available');
    const rect = seat.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect).toHaveAttribute('width', '36');
    expect(rect).toHaveAttribute('height', '36');
  });
});