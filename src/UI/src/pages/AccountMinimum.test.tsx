import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Account, defaultMonthlyRecords } from '../domain/account';
import { type AccountRepository, createMockAccountRepository } from '../domain/accountRepository';
import { createMockBudgetRepository } from '../domain/budgetRepository';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { AccountPage } from './AccountPage';

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'checking',
  name: 'Everyday Checking',
  type: 'Checking',
  startingBalance: 100,
  minimumAmount: 100,
  startDate: '2026-01-01',
  yieldRate: 0,
  assignedIncomeSourceIds: [],
  columns: [],
  monthlyRecords: defaultMonthlyRecords().map((record) => ({
    ...record,
    additionalIncome: record.month === 'Oct-26' ? 50 : 0,
  })),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const renderPage = (
  accounts = [account()],
  view: 'account' | 'aggregate' = 'account',
  repository: AccountRepository = createMockAccountRepository({ initialAccounts: accounts }),
) => {
  const incomeRepository = createMockIncomeSourceRepository({ initialSources: [] });
  const budgetRepository = createMockBudgetRepository();
  budgetRepository.listCategoriesWithSubCategories = async () => [];
  const result = render(
    <AccountPage accountRepository={repository} incomeRepository={incomeRepository}
      budgetRepository={budgetRepository} defaultViewMode={view} />,
  );
  return { repository, ...result };
};

const minimumCard = () => screen.getByRole('region', { name: /^Account Minimum$/i });
const totalCard = () => screen.getByRole('region', { name: /^Total Account Minimum$/i });
const openEdit = async () => userEvent.click(await screen.findByRole('button', { name: /edit everyday checking/i }));
const minimumInput = () => screen.getByLabelText(/account minimum \(optional\)/i);
const showDashboard = async () => userEvent.click(screen.getByRole('tab', { name: /bank dashboard/i }));

describe('Account minimum behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.setSystemTime(new Date(2026, 9, 20, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('uses the actual current-month projected ending balance and allows coverage above 100%', async () => {
    renderPage();
    const card = await screen.findByRole('region', { name: /^Account Minimum$/i });
    expect(card).toHaveTextContent('Minimum Amount');
    expect(card).toHaveTextContent('$100.00');
    expect(card).toHaveTextContent('Current Amount');
    expect(card).toHaveTextContent(/October 2026|Oct(?:ober)?[- ]2026|Oct-26/i);
    expect(card).toHaveTextContent(/current.month projected ending balance/i);
    expect(card).toHaveTextContent('$150.00');
    expect(card).toHaveTextContent('150%');
  });

  it.each([
    { balance: 75, percent: '75%' },
    { balance: 0, percent: '0%' },
    { balance: -25, percent: '-25%' },
    { balance: 123.45, percent: '123.5%' },
  ])('shows an unclamped percentage for current amount $balance', async ({ balance, percent }) => {
    renderPage([account({ startingBalance: balance, monthlyRecords: defaultMonthlyRecords() })]);
    const card = await screen.findByRole('region', { name: /^Account Minimum$/i });
    expect(card).toHaveTextContent(percent);
    expect(card).not.toHaveTextContent(/Infinity|NaN/);
  });

  it.each([
    { description: 'missing current-month record', overrides: { monthlyRecords: defaultMonthlyRecords().filter((r) => r.month !== 'Oct-26') } },
    { description: 'future account start', overrides: { startDate: '2026-11-01' } },
    { description: 'no monthly records', overrides: { monthlyRecords: [] } },
  ])('shows unavailable for $description without hiding the saved minimum', async ({ overrides }) => {
    renderPage([account(overrides)]);
    const card = await screen.findByRole('region', { name: /^Account Minimum$/i });
    expect(card).toHaveTextContent('$100.00');
    expect(within(card).getAllByText('Unavailable')).toHaveLength(2);
    expect(card).not.toHaveTextContent('150%');
  });

  it('does not reuse a month from 2026 outside the supported projection year', async () => {
    vi.setSystemTime(new Date(2027, 9, 20, 12));
    renderPage();
    const card = await screen.findByRole('region', { name: /^Account Minimum$/i });
    expect(within(card).getAllByText('Unavailable')).toHaveLength(2);
  });

  it('refreshes the current calendar month when the page regains focus', async () => {
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59));
    renderPage();
    expect(await screen.findByRole('region', { name: /^Account Minimum$/i })).toHaveTextContent('100%');
    vi.setSystemTime(new Date(2026, 9, 1, 0, 1));
    fireEvent.focus(window);
    await waitFor(() => expect(minimumCard()).toHaveTextContent('150%'));
  });

  it('refreshes across midnight month rollover while the page stays open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59, 50));
    renderPage();
    expect(await screen.findByRole('region', { name: /^Account Minimum$/i })).toHaveTextContent('100%');
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(minimumCard()).toHaveTextContent('150%');
  });

  it('switches the complete card with selection and hides it for an unconfigured account', async () => {
    renderPage([
      account(),
      account({ id: 'savings', name: 'Rainy Day Savings', type: 'Savings', minimumAmount: 200, startingBalance: 150, monthlyRecords: defaultMonthlyRecords() }),
      account({ id: 'legacy', name: 'Legacy Checking', minimumAmount: undefined }),
    ]);
    expect(await screen.findByRole('region', { name: /^Account Minimum$/i })).toHaveTextContent('150%');
    await userEvent.click(screen.getByText('Rainy Day Savings'));
    expect(minimumCard()).toHaveTextContent('$200.00');
    expect(minimumCard()).toHaveTextContent('75%');
    expect(minimumCard()).not.toHaveTextContent('$100.00');
    await userEvent.click(screen.getByText('Legacy Checking'));
    expect(screen.queryByRole('region', { name: /^Account Minimum$/i })).not.toBeInTheDocument();
  });

  it('creates, edits, and clears a saved minimum and recalculates the dashboard', async () => {
    const { repository } = renderPage([]);
    await userEvent.click(await screen.findByRole('button', { name: /^add account$/i }));
    await userEvent.type(screen.getByLabelText(/account name/i), 'Everyday Checking');
    await userEvent.type(screen.getByLabelText(/starting balance/i), '150');
    expect(minimumInput()).toHaveAccessibleDescription(/minimum amount you want to keep/i);
    await userEvent.type(minimumInput(), '100.25');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByRole('button', { name: /edit everyday checking/i });
    expect(screen.queryByLabelText(/account minimum \(optional\)/i)).not.toBeInTheDocument();
    expect((await repository.listAccounts())[0].minimumAmount).toBe(100.25);
    await showDashboard();
    expect(totalCard()).toHaveTextContent('$100.25');

    await userEvent.click(screen.getByRole('tab', { name: /single account view/i }));
    await openEdit();
    await userEvent.clear(minimumInput());
    await userEvent.type(minimumInput(), '250');
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    await waitFor(() => expect(screen.queryByLabelText(/account minimum \(optional\)/i)).not.toBeInTheDocument());
    await showDashboard();
    expect(totalCard()).toHaveTextContent('$250.00');

    await userEvent.click(screen.getByRole('tab', { name: /single account view/i }));
    await openEdit();
    await userEvent.clear(minimumInput());
    await userEvent.type(minimumInput(), '0');
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    await waitFor(() => expect(screen.queryByLabelText(/account minimum \(optional\)/i)).not.toBeInTheDocument());
    expect((await repository.listAccounts())[0].minimumAmount).toBeNull();
    expect(screen.queryByRole('region', { name: /^Account Minimum$/i })).not.toBeInTheDocument();
    await showDashboard();
    expect(totalCard()).toHaveTextContent('$0.00');
    expect(totalCard()).toHaveTextContent('No account minimums configured');
  });

  it.each(['-1', '1.234', '1000000000', 'NaN', 'Infinity', '1e2', '1,2,3'])('rejects invalid minimum %s and keeps entered input', async (value) => {
    renderPage();
    await openEdit();
    await userEvent.clear(minimumInput());
    await userEvent.type(minimumInput(), value);
    expect(minimumInput()).toHaveValue(value);
    expect(minimumInput()).toHaveAttribute('aria-invalid', 'true');
    expect(minimumInput()).toHaveAccessibleDescription(/valid|amount|decimal|minimum/i);
    expect(screen.getByRole('button', { name: /save account/i })).toBeDisabled();
  });

  it('leaves the saved minimum and aggregate unchanged after cancel', async () => {
    const { repository } = renderPage();
    await openEdit();
    await userEvent.clear(minimumInput());
    await userEvent.type(minimumInput(), '900');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect((await repository.listAccounts())[0].minimumAmount).toBe(100);
    expect(minimumCard()).toHaveTextContent('$100.00');
    await showDashboard();
    expect(totalCard()).toHaveTextContent('$100.00');
    expect(totalCard()).not.toHaveTextContent('$900.00');
  });

  it('keeps keyboard focus in the account dialog and restores it when Escape cancels', async () => {
    const { repository } = renderPage();
    const editButton = await screen.findByRole('button', { name: /edit everyday checking/i });
    await userEvent.click(editButton);
    expect(screen.getByRole('dialog', { name: /edit account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/account name/i)).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: /save account/i })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText(/account name/i)).toHaveFocus();
    await userEvent.click(minimumInput());
    await userEvent.clear(minimumInput());
    await userEvent.type(minimumInput(), '900');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(editButton).toHaveFocus();
    expect((await repository.listAccounts())[0].minimumAmount).toBe(100);
  });

  it('labels monthly draft previews as unsaved and preserves the minimum when monthly changes save', async () => {
    const { repository } = renderPage();
    await screen.findByRole('region', { name: /^Account Minimum$/i });
    const additionalIncome = screen.getByLabelText('Additional Income Oct-26');
    await userEvent.click(additionalIncome);
    await userEvent.clear(additionalIncome);
    await userEvent.type(additionalIncome, '75');
    expect(minimumCard()).toHaveTextContent('$175.00');
    expect(minimumCard()).toHaveTextContent('175%');
    expect(minimumCard()).toHaveTextContent(/unsaved/i);
    expect((await repository.listAccounts())[0].minimumAmount).toBe(100);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(minimumCard()).not.toHaveTextContent(/unsaved/i));
    expect((await repository.listAccounts())[0].minimumAmount).toBe(100);
    expect(minimumCard()).toHaveTextContent('175%');
    await showDashboard();
    expect(totalCard()).toHaveTextContent('$100.00');
  });

  it('keeps the selected account and unsaved monthly preview when saving before a switch fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const savings = account({ id: 'savings', name: 'Rainy Day Savings', type: 'Savings', minimumAmount: 200 });
    const repository = createMockAccountRepository({ initialAccounts: [account(), savings] });
    vi.spyOn(repository, 'updateAccount').mockRejectedValueOnce(new Error('Save unavailable'));
    renderPage(undefined, 'account', repository);
    await screen.findByRole('region', { name: /^Account Minimum$/i });
    const additionalIncome = screen.getByLabelText('Additional Income Oct-26');
    await userEvent.click(additionalIncome);
    await userEvent.clear(additionalIncome);
    await userEvent.type(additionalIncome, '75');
    await userEvent.click(screen.getByText(savings.name));
    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to save|try again/i);
    expect(minimumCard()).toHaveTextContent('$100.00');
    expect(minimumCard()).toHaveTextContent('175%');
    expect(minimumCard()).toHaveTextContent(/unsaved/i);
    expect(minimumCard()).not.toHaveTextContent('$200.00');
    expect((await repository.listAccounts()).find((item) => item.id === 'checking')?.monthlyRecords.find((record) => record.month === 'Oct-26')?.additionalIncome).toBe(50);
    await userEvent.click(screen.getByText(savings.name));
    await waitFor(() => expect(minimumCard()).toHaveTextContent('$200.00'));
    expect((await repository.listAccounts()).find((item) => item.id === 'checking')?.monthlyRecords.find((record) => record.month === 'Oct-26')?.additionalIncome).toBe(75);
  });

  it('preserves the minimum when editing another account field', async () => {
    const { repository } = renderPage();
    await openEdit();
    await userEvent.clear(screen.getByLabelText(/account name/i));
    await userEvent.type(screen.getByLabelText(/account name/i), 'Renamed Checking');
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    await screen.findByRole('button', { name: /edit renamed checking/i });
    expect((await repository.listAccounts())[0].minimumAmount).toBe(100);
  });

  it('accepts the maximum permitted minimum and clears it with blank input', async () => {
    const { repository } = renderPage();
    await openEdit();
    await userEvent.clear(minimumInput());
    await userEvent.type(minimumInput(), '999999999.99');
    expect(screen.getByRole('button', { name: /save account/i })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    await waitFor(() => expect(screen.queryByLabelText(/account minimum \(optional\)/i)).not.toBeInTheDocument());
    expect((await repository.listAccounts())[0].minimumAmount).toBe(999999999.99);
    await openEdit();
    await userEvent.clear(minimumInput());
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    await waitFor(() => expect(screen.queryByLabelText(/account minimum \(optional\)/i)).not.toBeInTheDocument());
    expect((await repository.listAccounts())[0].minimumAmount).toBeNull();
  });

  it('recalculates the total and projection threshold after deleting an eligible account', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const repository = createMockAccountRepository({ initialAccounts: [
      account(),
      account({ id: 'savings', name: 'Savings', type: 'Savings', minimumAmount: 200 }),
    ] });
    const list = vi.spyOn(repository, 'listAccounts');
    renderPage(undefined, 'account', repository);
    await screen.findByRole('region', { name: /^Account Minimum$/i });
    list.mockRejectedValue(new Error('Reload unavailable'));
    await userEvent.click(screen.getByRole('button', { name: /delete everyday checking/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /edit everyday checking/i })).not.toBeInTheDocument());
    await showDashboard();
    expect(totalCard()).toHaveTextContent('$200.00');
    expect(screen.getByRole('img', { name: /aggregate bank balance projection/i })).toHaveAccessibleDescription(/Total Account Minimum: \$200\.00/);
    expect(list).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retains failed-save input and saved totals, then allows retry', async () => {
    const repository = createMockAccountRepository({ initialAccounts: [account()] });
    const update = vi.spyOn(repository, 'updateAccount').mockRejectedValueOnce(new Error('Service unavailable'));
    renderPage(undefined, 'account', repository);
    await openEdit();
    await userEvent.clear(minimumInput());
    await userEvent.type(minimumInput(), '250');
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/save|unavailable|try again/i);
    expect(minimumInput()).toHaveValue('250');
    expect(minimumCard()).toHaveTextContent('$100.00');
    expect((await repository.listAccounts())[0].minimumAmount).toBe(100);
    expect(update).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    await waitFor(() => expect(screen.queryByLabelText(/account minimum \(optional\)/i)).not.toBeInTheDocument());
    await showDashboard();
    expect(totalCard()).toHaveTextContent('$250.00');
  });

  it('saves linked checking and savings together, retaining both minimums after a failed batch', async () => {
    const savings = account({ id: 'savings', name: 'Rainy Day Savings', type: 'Savings', minimumAmount: 200 });
    const checking = account({ savingsAccountId: savings.id });
    const repository = createMockAccountRepository({ initialAccounts: [checking, savings] });
    const batch = vi.spyOn(repository, 'updateAccountsBatch').mockRejectedValueOnce(new Error('Savings synchronization failed'));
    const singleUpdate = vi.spyOn(repository, 'updateAccount');
    renderPage(undefined, 'account', repository);
    await openEdit();
    await userEvent.clear(minimumInput());
    await userEvent.type(minimumInput(), '250');
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to update|try again/i);
    expect(minimumInput()).toHaveValue('250');
    expect((await repository.listAccounts()).map((item) => item.minimumAmount)).toEqual([100, 200]);
    expect(singleUpdate).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await repository.listAccounts()).map((item) => item.minimumAmount)).toEqual([250, 200]);
    await showDashboard();
    expect(totalCard()).toHaveTextContent('$450.00');
  });

  it('rolls back a linked account creation when savings synchronization fails and retains input for retry', async () => {
    const savings = account({ id: 'savings', name: 'Rainy Day Savings', type: 'Savings', minimumAmount: 200 });
    const repository = createMockAccountRepository({ initialAccounts: [savings] });
    vi.spyOn(repository, 'updateAccountsBatch').mockRejectedValueOnce(new Error('Savings synchronization failed'));
    const create = vi.spyOn(repository, 'createAccount');
    const remove = vi.spyOn(repository, 'deleteAccount');
    renderPage(undefined, 'account', repository);
    await userEvent.click(await screen.findByRole('button', { name: /^add account$/i }));
    await userEvent.type(screen.getByLabelText(/account name/i), 'Linked Checking');
    await userEvent.type(screen.getByLabelText(/starting balance/i), '150');
    await userEvent.type(minimumInput(), '100');
    await userEvent.selectOptions(screen.getByLabelText(/associated savings account/i), savings.id);
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to create|try again/i);
    expect(screen.getByLabelText(/account name/i)).toHaveValue('Linked Checking');
    expect(minimumInput()).toHaveValue('100');
    expect(await repository.listAccounts()).toEqual([savings]);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ minimumAmount: '' }));
    expect(remove).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const accounts = await repository.listAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts.find((item) => item.name === 'Linked Checking')?.minimumAmount).toBe(100);
    expect(accounts.find((item) => item.id === savings.id)?.minimumAmount).toBe(200);
    await showDashboard();
    expect(totalCard()).toHaveTextContent('$300.00');
  });

  it('shows failed creation rollback clearly and retries as an edit without creating a duplicate account', async () => {
    const savings = account({ id: 'savings', name: 'Rainy Day Savings', type: 'Savings', minimumAmount: 200 });
    const repository = createMockAccountRepository({ initialAccounts: [savings] });
    vi.spyOn(repository, 'updateAccountsBatch').mockRejectedValueOnce(new Error('Savings synchronization failed'));
    vi.spyOn(repository, 'deleteAccount').mockRejectedValueOnce(new Error('Rollback unavailable'));
    const create = vi.spyOn(repository, 'createAccount');
    renderPage(undefined, 'account', repository);
    await userEvent.click(await screen.findByRole('button', { name: /^add account$/i }));
    await userEvent.type(screen.getByLabelText(/account name/i), 'Linked Checking');
    await userEvent.type(screen.getByLabelText(/starting balance/i), '150');
    await userEvent.type(minimumInput(), '100');
    await userEvent.selectOptions(screen.getByLabelText(/associated savings account/i), savings.id);
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/created without a minimum.*retry save account/i);
    await screen.findByRole('button', { name: /edit linked checking/i });
    await waitFor(() => expect(screen.queryByRole('region', { name: /^Account Minimum$/i })).not.toBeInTheDocument());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('alert')).toHaveTextContent(/created without a minimum.*retry save account/i);
    expect(screen.getByRole('dialog', { name: /edit account/i })).toHaveAccessibleDescription(/created without a minimum.*retry save account/i);
    expect(minimumInput()).toHaveValue('100');
    const stagedAccounts = await repository.listAccounts();
    expect(stagedAccounts).toHaveLength(2);
    expect(stagedAccounts.find((item) => item.name === 'Linked Checking')?.minimumAmount).toBeNull();
    expect(stagedAccounts.find((item) => item.id === savings.id)?.minimumAmount).toBe(200);
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(create).toHaveBeenCalledTimes(1);
    const accounts = await repository.listAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts.find((item) => item.name === 'Linked Checking')?.minimumAmount).toBe(100);
    await showDashboard();
    expect(totalCard()).toHaveTextContent('$300.00');
  });

  it('adds saved checking and savings minimums once and excludes investments and unset values', async () => {
    renderPage([
      account(),
      account({ id: 'savings', name: 'Savings', type: 'Savings', minimumAmount: 200, monthlyRecords: [] }),
      account({ id: 'unset', name: 'Unset', minimumAmount: null }),
      account({ id: 'investment', name: 'Investment', type: 'Investment', minimumAmount: 9999 }),
    ], 'aggregate');
    await waitFor(() => expect(totalCard()).toHaveTextContent('$300.00'));
    expect(totalCard()).toHaveTextContent(/combined minimums for your checking and savings accounts/i);
    expect(within(totalCard()).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/minimum threshold/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/emergency fund minimum/i)).not.toBeInTheDocument();
  });

  it('shows the no-minimum state and neutral projection text for legacy accounts', async () => {
    renderPage([account({ minimumAmount: undefined })], 'aggregate');
    await waitFor(() => expect(totalCard()).toHaveTextContent('No account minimums configured'));
    expect(totalCard()).toHaveTextContent('$0.00');
    expect(screen.queryByText(/below (?:the )?(?:total account )?minimum/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/minimum (?:met|achieved)/i)).not.toBeInTheDocument();
  });

  it('does not show a fabricated zero total during account loading and retries failed loading', async () => {
    const repository = createMockAccountRepository({ initialAccounts: [account()] });
    let rejectLoad!: (error: Error) => void;
    vi.spyOn(repository, 'listAccounts').mockImplementationOnce(() => new Promise((_, reject) => { rejectLoad = reject; }));
    renderPage(undefined, 'aggregate', repository);
    expect(screen.getByText(/loading accounts/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Total Account Minimum$/i })).not.toBeInTheDocument();
    await act(async () => rejectLoad(new Error('Unavailable')));
    expect(await screen.findByRole('alert')).toHaveTextContent(/load|unavailable/i);
    expect(screen.queryByRole('region', { name: /^Total Account Minimum$/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    await waitFor(() => expect(totalCard()).toHaveTextContent('$100.00'));
  });

  it('explains the old local setting once without turning it into a saved minimum', async () => {
    localStorage.setItem('finance-companion-emergency-threshold', '20000');
    const first = renderPage([account({ minimumAmount: null })], 'aggregate');
    expect(await screen.findByText(/minimums are now configured per account/i)).toBeInTheDocument();
    await waitFor(() => expect(totalCard()).toHaveTextContent('$0.00'));
    expect((await first.repository.listAccounts())[0].minimumAmount).toBeNull();
    first.unmount();
    renderPage([account({ minimumAmount: null })], 'aggregate');
    await waitFor(() => expect(totalCard()).toHaveTextContent('$0.00'));
    expect(screen.queryByText(/minimums are now configured per account/i)).not.toBeInTheDocument();
  });
});
