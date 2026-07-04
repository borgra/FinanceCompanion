import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyEntraIdToken } from '../api/authApi';
import { AuthPage } from './AuthPage';
import { getEntraConfigurationError, signInWithEntra } from './entraAuth';

vi.mock('../api/authApi', () => ({
  verifyEntraIdToken: vi.fn(),
}));

vi.mock('./entraAuth', () => ({
  getEntraConfigurationError: vi.fn(),
  signInWithEntra: vi.fn(),
}));

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces the Entra configuration error and disables sign-in', () => {
    vi.mocked(getEntraConfigurationError).mockReturnValue(
      'Missing `VITE_ENTRA_CLIENT_ID`. Add it before using Microsoft sign-in.',
    );

    render(<AuthPage onAuthenticated={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/missing `vite_entra_client_id`/i);
    expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeDisabled();
  });

  it('exchanges the Entra ID token with the API before unlocking the app', async () => {
    const onAuthenticated = vi.fn();
    vi.mocked(getEntraConfigurationError).mockReturnValue(undefined);
    vi.mocked(signInWithEntra).mockResolvedValue({ idToken: 'entra-id-token' } as never);
    vi.mocked(verifyEntraIdToken).mockResolvedValue({
      user: {
        id: 'user-steve',
        email: 'steveborgra@gmail.com',
        displayName: 'Steve Borgra',
      },
    });

    render(<AuthPage onAuthenticated={onAuthenticated} />);

    await userEvent.click(screen.getByRole('button', { name: /sign in with microsoft/i }));

    await waitFor(() => {
      expect(verifyEntraIdToken).toHaveBeenCalledWith('entra-id-token');
    });
    expect(onAuthenticated).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          email: 'steveborgra@gmail.com',
        }),
      }),
    );
  });
});
