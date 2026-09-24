/**
 * WCAG 2.1 AA axe-core test for AttendeeHeatmap (issue #1172). Renders the
 * real component with static positions so its `<canvas>` + accessibility
 * layer (data table, live region, legend) is genuinely exercised.
 */
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import AttendeeHeatmap from '@/components/venues/AttendeeHeatmap';

const AXE_OPTIONS = {
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
};

interface AxeViolation {
  id: string;
  impact?: string | null;
  nodes: Array<{ html: string }>;
}

const positions = [
  { x: 5, y: 5, timestamp: 1, zoneId: 'a' },
  { x: 6, y: 6, timestamp: 2, zoneId: 'a' },
  { x: 105, y: 5, timestamp: 3, zoneId: 'b' },
];

describe('AttendeeHeatmap accessibility', () => {
  it('has no critical/serious axe violations', async () => {
    const { container, findByRole } = render(
      <AttendeeHeatmap positions={positions} width={300} height={200} tileSize={50} />,
    );
    await findByRole('table');
    const results = (await axe(container, AXE_OPTIONS)) as unknown as {
      violations: AxeViolation[];
    };
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    const summary = blocking
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html).join(' | ')}`)
      .join('\n');
    expect(summary).toBe('');
    await waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());
  });
});