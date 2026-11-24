import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import RegisterPage from '@/app/register/page';

const mockFetch = vi.fn();

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'taken@example.com');
  await user.type(screen.getByLabelText('Password'), 'password1');
  await user.type(screen.getByLabelText('Confirm password'), 'password1');
  await user.click(screen.getByRole('button', { name: /create account/i }));
}

describe('RegisterPage', () => {
  beforeEach(() => {
    push.mockClear();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('labels every field so it is reachable by its label', () => {
    render(<RegisterPage />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
  });

  it('shows an inline email error and does not navigate on a 409 duplicate email', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ message: 'A user with this email already exists' }),
    });
    render(<RegisterPage />);

    await fillAndSubmit();

    expect(await screen.findByText('This email address is already taken')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(mockFetch).toHaveBeenCalledWith('/api/proxy/auth/register', expect.objectContaining({ method: 'POST' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('redirects to login after a successful registration', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({}) });
    render(<RegisterPage />);

    await fillAndSubmit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?registered=1'));
  });
});
