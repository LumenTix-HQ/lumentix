import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AttendeeHeatmap from '@/components/venues/AttendeeHeatmap';

const positions = [
  { x: 5, y: 5, timestamp: 1, zoneId: 'busy' },
  { x: 6, y: 6, timestamp: 2, zoneId: 'busy' },
  { x: 7, y: 7, timestamp: 3, zoneId: 'busy' },
  { x: 105, y: 5, timestamp: 4, zoneId: 'calm' },
];

describe('AttendeeHeatmap accessibility (issue #1172)', () => {
  it('exposes a density data table in sync with the tiles', async () => {
    render(
      <AttendeeHeatmap
        positions={positions}
        width={300}
        height={200}
        tileSize={50}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeTruthy();
    });
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')?.textContent).toContain(
      'Attendee density by zone',
    );
    // Two zones (grid-quantised buckets) rendered as rows.
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    // The canvas keeps its semantic label.
    expect(
      screen.getByRole('img', { name: /density heatmap/i }),
    ).toBeTruthy();
  });

  it('renders a text highest-density summary near the legend', async () => {
    render(
      <AttendeeHeatmap
        positions={positions}
        width={300}
        height={200}
        tileSize={50}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Highest density: zone \(/i)).toBeTruthy();
    });
    expect(screen.getByText(/\(3 attendees\)/)).toBeTruthy();
  });

  it('announces updates through a live region', async () => {
    render(
      <AttendeeHeatmap
        positions={positions}
        width={300}
        height={200}
        tileSize={50}
      />,
    );
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => {
      expect(region.textContent).toMatch(/Heatmap updated\./);
    });
  });
});