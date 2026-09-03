import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSessionUser } from './api/authApi';
import { loadWorkspace } from './api/workspaceApi';
import { App } from './App';

vi.mock('./api/authApi', () => ({
  loadSessionUser: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('./api/workspaceApi', () => ({
  loadWorkspace: vi.fn(),
}));

vi.mock('./auth/AuthPage', () => ({
  AuthPage: () => <div>Sign in</div>,
}));

vi.mock('./pages/LandingPage', () => ({
  LandingPage: () => <div>Workspace ready</div>,
}));

const workspace = {
  schemaVersion: 1,
  incomeSources: [],
  budgetCategories: [],
  accounts: [],
  holdings: [],
  netWorth: null,
  retirementPlan: null,
};

describe('App workspace bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadSessionUser).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'User',
    });
  });

  it('loads the aggregate workspace only once under StrictMode', async () => {
    vi.mocked(loadWorkspace).mockResolvedValue(workspace);

    render(<StrictMode><App /></StrictMode>);

    expect(await screen.findByText('Workspace ready')).toBeInTheDocument();
    expect(loadWorkspace).toHaveBeenCalledOnce();
  });

  it('starts one additional workspace request when the user retries', async () => {
    vi.mocked(loadWorkspace)
      .mockRejectedValueOnce(new Error('Temporary outage'))
      .mockResolvedValueOnce(workspace);

    render(<StrictMode><App /></StrictMode>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary outage');
    expect(screen.getByRole('heading', { name: /couldn't load your financial data/i })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('Workspace ready')).toBeInTheDocument());
    expect(loadWorkspace).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Financial workspace')).toHaveFocus();
  });
});
