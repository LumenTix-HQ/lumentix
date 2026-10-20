import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuditLogViewer } from '@/components/AuditLogViewer';

const getAccessToken = vi.fn(() => 'test-token');
vi.mock('@/lib/auth/auth', () => ({
  getAccessToken: () => getAccessToken(),
}));

function auditLog(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'log-1',
    action: 'TICKET_GIFT_WRAPPED',
    userId: 'user-1',
    resourceId: 'gift-1',
    metadata: { ticketId: 'ticket-1' },
    createdAt: '2026-01-15T10:30:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('AuditLogViewer', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    // jsdom does not implement object URLs or anchor downloads.
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderViewer() {
    const user = userEvent.setup();
    render(<AuditLogViewer />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    return user;
  }

  it('renders the audit rows returned by the API', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [auditLog()], total: 1, page: 1, lastPage: 1 }),
    );

    await renderViewer();

    expect(await screen.findByText('TICKET_GIFT_WRAPPED')).toBeInTheDocument();
    expect(screen.getByText('gift-1')).toBeInTheDocument();
  });

  it('reads lastPage so pagination reflects the API response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [auditLog()],
        total: 60,
        page: 1,
        lastPage: 3,
      }),
    );

    await renderViewer();

    // The helper reports `lastPage`, not `totalPages`; the viewer has to
    // follow it or the pager collapses to a single page.
    expect(await screen.findByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it('sends the free-text search term to the API on submit', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], total: 0, page: 1, lastPage: 1 }),
    );

    const user = await renderViewer();
    fetchMock.mockClear();

    await user.type(screen.getByLabelText('Search'), 'gift');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('search=gift');
    });
  });

  it('does not query on every keystroke', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], total: 0, page: 1, lastPage: 1 }),
    );

    const user = await renderViewer();
    fetchMock.mockClear();

    await user.type(screen.getByLabelText('Search'), 'abc');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the active search when the clear button is pressed', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], total: 0, page: 1, lastPage: 1 }),
    );

    const user = await renderViewer();
    await user.type(screen.getByLabelText('Search'), 'gift');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    fetchMock.mockClear();

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).not.toContain('search=');
    });
    expect(screen.getByLabelText('Search')).toHaveValue('');
  });

  it('exports CSV by default', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [auditLog()], total: 1, page: 1, lastPage: 1 }),
    );

    const user = await renderViewer();
    await user.click(screen.getByRole('button', { name: /Export CSV/i }));

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('/admin/audit/export');
      expect(lastCall).not.toContain('/export/json');
    });
  });

  it('exports JSON when the format is switched', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [auditLog()], total: 1, page: 1, lastPage: 1 }),
    );

    const user = await renderViewer();
    await user.selectOptions(
      screen.getByLabelText('Export format'),
      'json',
    );
    await user.click(screen.getByRole('button', { name: /Export JSON/i }));

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('/admin/audit/export/json');
    });
  });

  it('carries the active search term into the export request', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], total: 0, page: 1, lastPage: 1 }),
    );

    const user = await renderViewer();
    await user.type(screen.getByLabelText('Search'), 'refund');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    fetchMock.mockClear();

    await user.click(screen.getByRole('button', { name: /Export CSV/i }));

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('search=refund');
    });
  });

  it('filters by a ticket gift action using the value the backend writes', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], total: 0, page: 1, lastPage: 1 }),
    );

    const user = await renderViewer();
    fetchMock.mockClear();

    await user.selectOptions(
      screen.getByLabelText('Action type'),
      'TICKET_GIFT_UNWRAPPED',
    );

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('action=TICKET_GIFT_UNWRAPPED');
    });
  });

  it('offers the full gift lifecycle in the action filter', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], total: 0, page: 1, lastPage: 1 }),
    );

    await renderViewer();

    const options = within(screen.getByLabelText('Action type')).getAllByRole(
      'option',
    );
    const values = options.map((o) => (o as HTMLOptionElement).value);

    for (const action of [
      'TICKET_GIFT_WRAPPED',
      'TICKET_GIFT_RESCHEDULED',
      'TICKET_GIFT_DELIVERED',
      'TICKET_GIFT_UNWRAPPED',
      'TICKET_GIFT_CANCELLED',
    ]) {
      expect(values).toContain(action);
    }
  });

  it('shows an empty state when nothing matches', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], total: 0, page: 1, lastPage: 1 }),
    );

    await renderViewer();

    expect(
      await screen.findByText(/No audit logs found matching your filters/),
    ).toBeInTheDocument();
  });

  it('surfaces an API error message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Audit store unavailable' }),
    } as unknown as Response);

    await renderViewer();

    expect(
      await screen.findByText('Audit store unavailable'),
    ).toBeInTheDocument();
  });
});
