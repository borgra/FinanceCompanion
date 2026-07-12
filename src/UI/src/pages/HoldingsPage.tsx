import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  FinanceMoneyCellInput,
  FinanceMoneyCellValue,
  FinanceTable,
  FinanceTableHeaderCell,
} from '../components/FinanceTable';
import type { Account } from '../domain/account';
import type { AccountRepository } from '../domain/accountRepository';
import type { Holding, SecurityMetadata, SecurityPayoutDetails } from '../domain/holding';
import type { HoldingRepository } from '../domain/holdingRepository';

type HoldingsPageProps = {
  accountRepository: AccountRepository;
  holdingRepository: HoldingRepository;
};

const SECURITY_SEARCH_DELAY_MS = 2000;

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
});

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatQuantity = (value: number) => (value === 0 ? '' : numberFormatter.format(value));

const formatMoney = (value: number) => (value === 0 ? '$   -   ' : currencyFormatter.format(value));

const parseQuantity = (value: string) => Number(value.replace(/[,\s]/g, '')) || 0;

const refreshThrottleMs = 3000;

const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

const formatLastUpdated = (value?: string | null) => {
  if (!value) {
    return 'Not updated';
  }

  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) {
    return 'Last updated date unavailable';
  }

  return `Last updated ${updatedAt.toLocaleDateString()}`;
};

const mergeRefreshedSecurityDetails = (
  current: Holding[],
  refreshed: Holding[],
) => {
  const refreshedById = new Map(refreshed.map((holding) => [holding.id, holding]));

  return current.map((holding) => {
    const next = refreshedById.get(holding.id);
    if (!next) {
      return holding;
    }

    return {
      ...holding,
      security: next.security,
      updatedAt: next.updatedAt,
    };
  });
};

export function HoldingsPage({ accountRepository, holdingRepository }: HoldingsPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [dirtyHoldingIds, setDirtyHoldingIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SecurityMetadata[]>([]);
  const [selectedSecurity, setSelectedSecurity] = useState<SecurityMetadata | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshingHoldingIds, setRefreshingHoldingIds] = useState<Set<string>>(() => new Set());
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPayoutHolding, setEditingPayoutHolding] = useState<Holding | null>(null);
  const [payoutDrafts, setPayoutDrafts] = useState<SecurityPayoutDetails[]>([]);
  const [isSavingPayouts, setIsSavingPayouts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        const [nextAccounts, nextHoldings] = await Promise.all([
          accountRepository.listAccounts(),
          holdingRepository.listHoldings(),
        ]);
        setAccounts(nextAccounts.filter((account) => account.type === 'Investment'));
        setHoldings(nextHoldings);
      } catch {
        setError('Unable to load holdings.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [accountRepository, holdingRepository]);

  useEffect(() => {
    if (!isAddDialogOpen || selectedSecurity) {
      setIsSearching(false);
      return;
    }

    if (query.trim().length < 1) {
      setResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    let isCurrent = true;
    setIsSearching(true);
    const searchTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const nextResults = await holdingRepository.searchSecurities(query);
          if (isCurrent) {
            setResults(nextResults);
            setSearchError(null);
          }
        } catch {
          if (isCurrent) {
            setResults([]);
            setSearchError('Security search is unavailable. Check Alpha Vantage configuration and try again.');
          }
        } finally {
          if (isCurrent) {
            setIsSearching(false);
          }
        }
      })();
    }, SECURITY_SEARCH_DELAY_MS);

    return () => {
      isCurrent = false;
      window.clearTimeout(searchTimer);
    };
  }, [holdingRepository, isAddDialogOpen, query, selectedSecurity]);

  const managedAccounts = useMemo(
    () => accounts.filter((account) => account.manageHoldings),
    [accounts],
  );

  const accountNameById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );

  const closeAddDialog = () => {
    setIsAddDialogOpen(false);
    setQuery('');
    setResults([]);
    setSelectedSecurity(null);
    setSearchError(null);
    setIsSearching(false);
  };

  const openPayoutEditor = (holding: Holding) => {
    setEditingPayoutHolding(holding);
    setPayoutDrafts(
      (holding.security.payoutDetails ?? []).map((payout) => ({ ...payout, mode: 'manual' })),
    );
    setError(null);
  };

  const closePayoutEditor = () => {
    if (!isSavingPayouts) {
      setEditingPayoutHolding(null);
      setPayoutDrafts([]);
    }
  };

  const getQuantity = (holding: Holding, accountId: string) =>
    holding.accountPositions.find((position) => position.accountId === accountId)?.quantity ?? 0;

  const updateQuantity = (holdingId: string, accountId: string, rawValue: string) => {
    const quantity = Math.max(0, parseQuantity(rawValue));
    setHoldings((current) =>
      current.map((holding) => {
        if (holding.id !== holdingId) {
          return holding;
        }

        const existingPositions = new Map(
          holding.accountPositions.map((position) => [position.accountId, position]),
        );
        const accountPositions = managedAccounts.map((account) => ({
          accountId: account.id,
          quantity:
            account.id === accountId
              ? quantity
              : existingPositions.get(account.id)?.quantity ?? 0,
          costBasis: existingPositions.get(account.id)?.costBasis ?? null,
        }));

        return { ...holding, accountPositions };
      }),
    );
    setDirtyHoldingIds((current) => new Set(current).add(holdingId));
    setSuccessMessage(null);
  };

  const refreshHoldingDetails = async (holdingId: string) => {
    const holding = holdings.find((item) => item.id === holdingId);
    const hasManualPayouts = Boolean(holding?.security.manualPayoutDetails?.length);
    const replaceManualPayouts = hasManualPayouts
      ? window.confirm(
          `Replace ${holding?.security.symbol} manual payment data with the latest source data? Select Cancel to keep manual payment data.`,
        )
      : false;
    setRefreshingHoldingIds((current) => new Set(current).add(holdingId));
    setError(null);
    setSuccessMessage(null);
    try {
      const refreshed = hasManualPayouts
        ? await holdingRepository.refreshHoldingSecurityDetails(holdingId, { replaceManualPayouts })
        : await holdingRepository.refreshHoldingSecurityDetails(holdingId);
      setHoldings((current) => mergeRefreshedSecurityDetails(current, [refreshed]));
      setSuccessMessage(`${refreshed.security.symbol} was updated.`);
    } catch {
      setHoldings((current) =>
        current.map((holding) =>
          holding.id === holdingId
            ? {
                ...holding,
                security: {
                  ...holding.security,
                  detailsStatus: 'unavailable',
                },
              }
            : holding,
        ),
      );
      setError('Unable to update holding details.');
    } finally {
      setRefreshingHoldingIds((current) => {
        const next = new Set(current);
        next.delete(holdingId);
        return next;
      });
    }
  };

  const refreshAllHoldingDetails = async () => {
    const holdingsToRefresh = [...holdings];
    if (holdingsToRefresh.length === 0) {
      return;
    }

    setIsRefreshingAll(true);
    setError(null);
    setSuccessMessage(null);
    const failedSymbols: string[] = [];
    const holdingsWithManualPayouts = holdingsToRefresh.filter(
      (holding) => holding.security.manualPayoutDetails?.length,
    );
    const replaceManualPayouts = holdingsWithManualPayouts.length > 0
      ? window.confirm(
          `Replace manual payment data for all ${holdingsWithManualPayouts.length} affected holdings with source data? Select Cancel to keep all manual payment data.`,
        )
      : false;

    try {
      for (const [index, holding] of holdingsToRefresh.entries()) {
        setRefreshingHoldingIds((current) => new Set(current).add(holding.id));
        try {
          const refreshed = holdingsWithManualPayouts.length > 0
            ? await holdingRepository.refreshHoldingSecurityDetails(holding.id, { replaceManualPayouts })
            : await holdingRepository.refreshHoldingSecurityDetails(holding.id);
          setHoldings((current) => mergeRefreshedSecurityDetails(current, [refreshed]));
        } catch {
          failedSymbols.push(holding.security.symbol);
          setHoldings((current) =>
            current.map((item) =>
              item.id === holding.id
                ? {
                    ...item,
                    security: {
                      ...item.security,
                      detailsStatus: 'unavailable',
                    },
                  }
                : item,
            ),
          );
        } finally {
          setRefreshingHoldingIds((current) => {
            const next = new Set(current);
            next.delete(holding.id);
            return next;
          });
        }

        if (index < holdingsToRefresh.length - 1) {
          await wait(refreshThrottleMs);
        }
      }

      if (failedSymbols.length > 0) {
        setError(`Unable to update ${failedSymbols.join(', ')}.`);
      } else {
        setSuccessMessage('Holdings were updated.');
      }
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const addHoldingRow = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSecurity || managedAccounts.length === 0) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const created = await holdingRepository.createHolding({
        security: selectedSecurity,
        accountPositions: managedAccounts.map((account) => ({
          accountId: account.id,
          quantity: 0,
          costBasis: null,
        })),
      });
      setHoldings((current) => {
        const existingIndex = current.findIndex((holding) => holding.id === created.id);
        if (existingIndex === -1) {
          return [...current, created];
        }

        return current.map((holding) =>
          holding.id === created.id ? created : holding,
        );
      });
      setSuccessMessage(`${created.security.symbol} was added.`);
      closeAddDialog();
    } catch {
      setError('Unable to add holding.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveQuantityChanges = async () => {
    const dirtyHoldings = holdings.filter((holding) => dirtyHoldingIds.has(holding.id));
    if (dirtyHoldings.length === 0) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const updatedHoldings = await Promise.all(
        dirtyHoldings.map((holding) =>
          holdingRepository.updateHolding(holding.id, {
            security: holding.security,
            accountPositions: managedAccounts.map((account) => ({
              accountId: account.id,
              quantity: getQuantity(holding, account.id),
              costBasis:
                holding.accountPositions.find((position) => position.accountId === account.id)
                  ?.costBasis ?? null,
            })),
          }),
        ),
      );
      const updatedById = new Map(updatedHoldings.map((holding) => [holding.id, holding]));
      setHoldings((current) =>
        current.map((holding) => updatedById.get(holding.id) ?? holding),
      );
      setDirtyHoldingIds(new Set());
      const failedSymbols: string[] = [];

      for (const [index, holding] of updatedHoldings.entries()) {
        setRefreshingHoldingIds((current) => new Set(current).add(holding.id));
        try {
          const refreshed = await holdingRepository.refreshHoldingSecurityDetails(holding.id);
          setHoldings((current) => mergeRefreshedSecurityDetails(current, [refreshed]));
        } catch {
          failedSymbols.push(holding.security.symbol);
          setHoldings((current) =>
            current.map((item) =>
              item.id === holding.id
                ? {
                    ...item,
                    security: {
                      ...item.security,
                      detailsStatus: 'unavailable',
                    },
                  }
                : item,
            ),
          );
        } finally {
          setRefreshingHoldingIds((current) => {
            const next = new Set(current);
            next.delete(holding.id);
            return next;
          });
        }

        if (index < updatedHoldings.length - 1) {
          await wait(refreshThrottleMs);
        }
      }

      setSuccessMessage('Holdings saved.');
      if (failedSymbols.length > 0) {
        setError(`Holdings were saved, but ${failedSymbols.join(', ')} could not be updated.`);
      }
    } catch {
      setError('Unable to save holdings.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeHolding = async (holding: Holding) => {
    const confirmed = window.confirm(`Remove ${holding.security.symbol} from holdings?`);
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await holdingRepository.deleteHolding(holding.id);
      setHoldings((current) => current.filter((item) => item.id !== holding.id));
      setDirtyHoldingIds((current) => {
        const next = new Set(current);
        next.delete(holding.id);
        return next;
      });
      setSuccessMessage(`${holding.security.symbol} was removed.`);
    } catch {
      setError('Unable to remove holding.');
    } finally {
      setIsSaving(false);
    }
  };

  const updatePayoutDraft = (
    index: number,
    field: keyof Pick<SecurityPayoutDetails, 'paymentDate' | 'exDividendDate' | 'amount'>,
    value: string,
  ) => {
    setPayoutDrafts((current) =>
      current.map((payout, payoutIndex) =>
        payoutIndex === index
          ? {
              ...payout,
              [field]: field === 'amount' ? Number(value) || 0 : value,
            }
          : payout,
      ),
    );
  };

  const saveManualPayouts = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingPayoutHolding) {
      return;
    }

    const validPayouts = payoutDrafts.filter((payout) => payout.exDividendDate && payout.amount > 0);
    setIsSavingPayouts(true);
    setError(null);
    try {
      const updated = await holdingRepository.updateManualPayoutDetails(
        editingPayoutHolding.id,
        validPayouts.map((payout) => ({ ...payout, mode: 'manual' })),
      );
      setHoldings((current) => mergeRefreshedSecurityDetails(current, [updated]));
      setSuccessMessage(`${updated.security.symbol} payment data was saved.`);
      setEditingPayoutHolding(null);
      setPayoutDrafts([]);
    } catch {
      setError('Unable to save manual payment data.');
    } finally {
      setIsSavingPayouts(false);
    }
  };

  if (isLoading) {
    return <p className="status-copy">Loading holdings...</p>;
  }

  return (
    <section className="holdings-workspace" aria-labelledby="holdings-heading">
      <div className="holdings-table-header">
        <div>
          <div className="holdings-heading-row">
            <h2 id="holdings-heading">Holdings</h2>
            <button
              className="link-button holdings-refresh-action"
              type="button"
              onClick={() => void refreshAllHoldingDetails()}
              disabled={holdings.length === 0 || isRefreshingAll || isSaving}
              aria-label="Update all holdings"
              title="Update all holdings"
            >
              <span
                className={`material-symbols-outlined ${isRefreshingAll ? 'holdings-spin' : ''}`}
                aria-hidden="true"
              >
                sync
              </span>
            </button>
          </div>
          <p>Manage share quantities by investment account.</p>
        </div>
        <div className="funding-section-actions">
          <button
            className="secondary-action compact-add-action"
            type="button"
            onClick={() => setIsAddDialogOpen(true)}
            disabled={managedAccounts.length === 0}
          >
            Add Security
          </button>
          <button
            className="primary-action compact-add-action"
            type="button"
            onClick={() => void saveQuantityChanges()}
            disabled={dirtyHoldingIds.size === 0 || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {managedAccounts.length === 0 ? (
        <div className="investment-account-empty">
          <p>Turn on Manage Holdings for at least one investment account.</p>
        </div>
      ) : (
        <FinanceTable wrapperClassName="holdings-finance-table" wrapperStyle={{ marginTop: 0 }}>
          <thead>
            <tr>
              <FinanceTableHeaderCell icon="show_chart">Security</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Ticker</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Total Qty</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Price</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Value</FinanceTableHeaderCell>
              {managedAccounts.map((account) => (
                <FinanceTableHeaderCell key={account.id} icon="account_balance" isEditable>
                  {account.name.length > 18 ? `${account.name.slice(0, 15)}...` : account.name}
                </FinanceTableHeaderCell>
              ))}
              <FinanceTableHeaderCell>Actions</FinanceTableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr>
                <td colSpan={6 + managedAccounts.length}>
                  <span className="excel-cell-val">No holdings have been added yet.</span>
                </td>
              </tr>
            ) : (
              holdings.map((holding) => {
                const totalQuantity = managedAccounts.reduce(
                  (total, account) => total + getQuantity(holding, account.id),
                  0,
                );
                const price = holding.security.price ?? 0;

                return (
                  <tr key={holding.id}>
                    <td className="holdings-security-cell">
                      <strong>{holding.security.name}</strong>
                      <small>{formatLastUpdated(holding.security.detailsUpdatedAt)}</small>
                    </td>
                    <td>
                      <span className="excel-cell-val">{holding.security.symbol}</span>
                    </td>
                    <td>
                      <FinanceMoneyCellValue
                        value={totalQuantity}
                        formatValue={formatQuantity}
                      />
                    </td>
                    <td>
                      <FinanceMoneyCellValue value={price} formatValue={formatMoney} />
                    </td>
                    <td>
                      <FinanceMoneyCellValue
                        value={totalQuantity * price}
                        formatValue={formatMoney}
                      />
                    </td>
                    {managedAccounts.map((account) => (
                      <td key={account.id} title={accountNameById.get(account.id)}>
                        <FinanceMoneyCellInput
                          value={getQuantity(holding, account.id)}
                          formatValue={formatQuantity}
                          onValueChange={(value) => updateQuantity(holding.id, account.id, value)}
                          focusId={`holding-${holding.id}-${account.id}`}
                          aria-label={`${holding.security.symbol} quantity for ${account.name}`}
                        />
                      </td>
                    ))}
                    <td>
                      <div className="holdings-row-actions">
                        <button
                          className="link-button holdings-refresh-action"
                          type="button"
                          onClick={() => openPayoutEditor(holding)}
                          disabled={isSaving || refreshingHoldingIds.has(holding.id)}
                          aria-label={`Edit ${holding.security.symbol} payments`}
                          title={`Edit ${holding.security.symbol} payments`}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">payments</span>
                        </button>
                        <button
                          className="link-button holdings-refresh-action"
                          type="button"
                          onClick={() => void refreshHoldingDetails(holding.id)}
                          disabled={isSaving || refreshingHoldingIds.has(holding.id)}
                          aria-label={`Update ${holding.security.symbol} holding`}
                          title={`Update ${holding.security.symbol}`}
                        >
                          <span
                            className={`material-symbols-outlined ${
                              refreshingHoldingIds.has(holding.id) ? 'holdings-spin' : ''
                            }`}
                            aria-hidden="true"
                          >
                            sync
                          </span>
                        </button>
                        <button
                          className="link-button link-button-danger holdings-remove-action"
                          type="button"
                          onClick={() => void removeHolding(holding)}
                          disabled={isSaving || refreshingHoldingIds.has(holding.id)}
                          aria-label={`Remove ${holding.security.symbol} holding`}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </FinanceTable>
      )}

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {successMessage ? <p className="form-success" role="status">{successMessage}</p> : null}

      {isAddDialogOpen ? (
        <div className="modal-overlay" onClick={closeAddDialog}>
          <form className="modal-container" onSubmit={addHoldingRow} onClick={(event) => event.stopPropagation()}>
            <h2>Add Security</h2>
            <div className="modal-form">
              <label className="field" htmlFor="security-search">
                <span>Security</span>
                <input
                  id="security-search"
                  type="search"
                  value={query}
                  placeholder="Search by symbol or name"
                  autoFocus
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedSecurity(null);
                    setSearchError(null);
                    setSuccessMessage(null);
                  }}
                />
              </label>

              <div className="security-search-results" aria-live="polite">
                {selectedSecurity ? (
                  <div className="security-result selected-security">
                    <strong>{selectedSecurity.symbol}</strong>
                    <span>{selectedSecurity.name}</span>
                    <small>{selectedSecurity.exchange} · {selectedSecurity.assetType}</small>
                  </div>
                ) : isSearching ? (
                  <p className="status-copy">Searching...</p>
                ) : searchError ? (
                  <p className="form-error" role="alert">{searchError}</p>
                ) : results.length > 0 ? (
                  results.map((security) => (
                    <button
                      className="security-result"
                      key={security.symbol}
                      type="button"
                      onClick={() => {
                        setSelectedSecurity(security);
                        setQuery(`${security.symbol} - ${security.name}`);
                      }}
                    >
                      <strong>{security.symbol}</strong>
                      <span>{security.name}</span>
                      <small>{security.exchange} · {security.assetType}</small>
                    </button>
                  ))
                ) : query ? (
                  <p className="status-copy">No matching securities.</p>
                ) : null}
              </div>
            </div>
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={closeAddDialog}>
                Cancel
              </button>
              <button className="primary-action" type="submit" disabled={!selectedSecurity || isSaving}>
                Add Row
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editingPayoutHolding ? (
        <div className="modal-overlay" onClick={closePayoutEditor}>
          <form
            className="modal-container payment-editor-modal"
            onSubmit={saveManualPayouts}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{editingPayoutHolding.security.symbol} Payments</h2>
            <p>Saving changes creates user-managed payment data that source refreshes preserve by default.</p>
            <div className="payment-editor-table" role="group" aria-label="Manual payment records">
              {payoutDrafts.map((payout, index) => (
                <div className="payment-editor-row" key={`${payout.exDividendDate}-${index}`}>
                  <label>
                    <span>Payment date</span>
                    <input
                      type="date"
                      value={payout.paymentDate || payout.exDividendDate}
                      onChange={(event) => updatePayoutDraft(index, 'paymentDate', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Ex-date</span>
                    <input
                      type="date"
                      value={payout.exDividendDate}
                      onChange={(event) => updatePayoutDraft(index, 'exDividendDate', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Per share</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={payout.amount}
                      onChange={(event) => updatePayoutDraft(index, 'amount', event.target.value)}
                    />
                  </label>
                  <button
                    className="link-button link-button-danger"
                    type="button"
                    aria-label={`Remove payment ${index + 1}`}
                    onClick={() => setPayoutDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                  </button>
                </div>
              ))}
            </div>
            <button
              className="secondary-action"
              type="button"
              onClick={() => setPayoutDrafts((current) => [
                ...current,
                { exDividendDate: '', paymentDate: '', amount: 0, mode: 'manual', source: 'user' },
              ])}
            >
              Add payment
            </button>
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={closePayoutEditor}>
                Cancel
              </button>
              <button className="primary-action" type="submit" disabled={isSavingPayouts}>
                {isSavingPayouts ? 'Saving...' : 'Save payments'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
