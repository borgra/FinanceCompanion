import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  FinanceMoneyCellInput,
  FinanceMoneyCellValue,
  FinanceTable,
  FinanceTableHeaderCell,
} from '../components/FinanceTable';
import type { Account } from '../domain/account';
import type { AccountRepository } from '../domain/accountRepository';
import type { Holding, SecurityMetadata } from '../domain/holding';
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

export function HoldingsPage({ accountRepository, holdingRepository }: HoldingsPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [dirtyHoldingIds, setDirtyHoldingIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SecurityMetadata[]>([]);
  const [selectedSecurity, setSelectedSecurity] = useState<SecurityMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
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
          }
        } catch {
          if (isCurrent) {
            setResults([]);
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
    setIsSearching(false);
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
      setHoldings((current) => [...current, created]);
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
      setSuccessMessage('Holdings saved.');
    } catch {
      setError('Unable to save holdings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p className="status-copy">Loading holdings...</p>;
  }

  return (
    <section className="holdings-workspace" aria-labelledby="holdings-heading">
      <div className="holdings-table-header">
        <div>
          <h2 id="holdings-heading">Holdings</h2>
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
              <FinanceTableHeaderCell>Total Qty</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Price</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Value</FinanceTableHeaderCell>
              {managedAccounts.map((account) => (
                <FinanceTableHeaderCell key={account.id} icon="account_balance">
                  {account.name.length > 18 ? `${account.name.slice(0, 15)}...` : account.name}
                </FinanceTableHeaderCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr>
                <td colSpan={4 + managedAccounts.length}>
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
                      <strong>{holding.security.symbol}</strong>
                      <span>{holding.security.name}</span>
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
    </section>
  );
}
