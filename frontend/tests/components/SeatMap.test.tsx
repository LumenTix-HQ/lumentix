import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeatMap from '@/components/venues/SeatMap';
import type { Seat } from '@/types/event';

const seats: Seat[] = [
  { id: 's1', sectionId: 'sec', seatIdentifier: 'A1', row: 1, number: 1, status: 'available', heldBy: null },
  { id: 's2', sectionId: 'sec', seatIdentifier: 'A2', row: 1, number: 2, status: 'booked', heldBy: null },
  { id: 's3', sectionId: 'sec', seatIdentifier: 'A3', row: 1, number: 3, status: 'held', heldBy: 'x' },
];

describe('SeatMap', () => {
  it('renders one button per seat inside the seat map group', () => {
    render(<SeatMap seats={seats} sectionName="Main" onSelectSeat={() => {}} />);
    const map = screen.getByRole('group', { name: /main interactive seat map/i });
    expect(within(map).getAllByRole('button')).toHaveLength(3);
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

  describe('screen reader and keyboard support (#1434)', () => {
    const grid: Seat[] = [
      { id: 'a1', sectionId: 'sec', seatIdentifier: 'A1', row: 1, number: 1, status: 'available', heldBy: null },
      { id: 'a2', sectionId: 'sec', seatIdentifier: 'A2', row: 1, number: 2, status: 'booked', heldBy: null },
      { id: 'a3', sectionId: 'sec', seatIdentifier: 'A3', row: 1, number: 3, status: 'available', heldBy: null, price: 50, pricingTier: 'Premium', obstructedView: true },
      { id: 'b1', sectionId: 'sec', seatIdentifier: 'B1', row: 2, number: 1, status: 'available', heldBy: null },
      { id: 'b2', sectionId: 'sec', seatIdentifier: 'B2', row: 2, number: 2, status: 'available', heldBy: null },
    ];

    it('does not wrap seats in role="img", which would hide them from screen readers', () => {
      const { container } = render(<SeatMap seats={grid} sectionName="Main" onSelectSeat={() => {}} />);
      expect(container.querySelector('svg')).not.toHaveAttribute('role', 'img');
      expect(screen.getByRole('group', { name: /interactive seat map/i })).toHaveAccessibleDescription(
        /arrow keys/i,
      );
    });

    it('labels seats with their state, tier, price and view', () => {
      render(<SeatMap seats={grid} sectionName="Main" onSelectSeat={() => {}} selectedSeatId="b1" />);
      expect(screen.getByRole('button', { name: 'Seat A2, booked, unavailable' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Seat A3, available, Premium, 50 XLM, obstructed view' }),
      ).toBeInTheDocument();
      const selected = screen.getByRole('button', { name: 'Seat B1, selected' });
      expect(selected).toHaveAttribute('aria-pressed', 'true');
    });

    it('exposes a single tab stop for the whole map', () => {
      render(<SeatMap seats={grid} sectionName="Main" onSelectSeat={() => {}} />);
      const map = screen.getByRole('group', { name: /interactive seat map/i });
      const tabbable = within(map)
        .getAllByRole('button')
        .filter((el) => el.getAttribute('tabindex') === '0');
      expect(tabbable).toHaveLength(1);
      expect(tabbable[0]).toHaveAttribute('title', 'A1 - available');
    });

    it('moves focus between seats with the arrow keys', async () => {
      const user = userEvent.setup();
      render(<SeatMap seats={grid} sectionName="Main" onSelectSeat={() => {}} />);

      screen.getByTitle('A1 - available').focus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByTitle('A2 - booked')).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByTitle('B2 - available')).toHaveFocus();
      await user.keyboard('{ArrowLeft}');
      expect(screen.getByTitle('B1 - available')).toHaveFocus();
      await user.keyboard('{ArrowUp}');
      expect(screen.getByTitle('A1 - available')).toHaveFocus();
      await user.keyboard('{End}');
      expect(screen.getByTitle('A3 - available')).toHaveFocus();
      expect(screen.getByTitle('A3 - available')).toHaveAttribute('tabindex', '0');
      expect(screen.getByTitle('A1 - available')).toHaveAttribute('tabindex', '-1');
    });

    it('does not select an unavailable seat from the keyboard', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(<SeatMap seats={grid} sectionName="Main" onSelectSeat={onSelect} />);

      screen.getByTitle('A1 - available').focus();
      await user.keyboard('{ArrowRight}{Enter} ');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('renders zoom controls as real buttons', async () => {
      const user = userEvent.setup();
      render(<SeatMap seats={grid} sectionName="Main" onSelectSeat={() => {}} />);
      await user.click(screen.getByRole('button', { name: 'Zoom in' }));
      expect(screen.getByText('120%')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Zoom out' })).toHaveAttribute('type', 'button');
    });
  });
});
