import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventForm from '@/components/events/EventForm';

describe('EventForm validation', () => {
  it('blocks submission and shows a title error when required fields are empty', async () => {
    const onSubmit = vi.fn();
    const { container } = render(<EventForm mode="create" onSubmit={onSubmit} />);

    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submit);

    await waitFor(() =>
      expect(screen.getByText(/Title must be at least 3 characters/i)).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a title error for a too-short title', async () => {
    const onSubmit = vi.fn();
    const { container } = render(<EventForm mode="create" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Lumentix Builder Summit'), {
      target: { value: 'ab' },
    });
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() =>
      expect(screen.getByText(/Title must be at least 3 characters/i)).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
