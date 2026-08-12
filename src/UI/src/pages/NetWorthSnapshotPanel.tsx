import { useEffect, useMemo, useRef, useState } from 'react';
import { FinanceMoneyCellInput, FinanceMoneyCellValue, FinanceTable, FinanceTableHeaderCell } from '../components/FinanceTable';
import type { Account } from '../domain/account';
import type { MonthlyNetWorthSnapshot, MonthlyNetWorthSnapshots, NetWorth } from '../domain/netWorth';

type SnapshotDraft = {
  month: string;
  snapshot: MonthlyNetWorthSnapshot;
  isFreshCapture: boolean;
};

type NetWorthSnapshotPanelProps = {
  accounts: Account[];
  currentValues: Map<string, number>;
  homeEquity: number;
  includeHomeEquity: boolean;
  monthlySnapshots: MonthlyNetWorthSnapshots;
  formatMoney: (value: number) => string;
  onSave: (month: string, snapshot: MonthlyNetWorthSnapshot) => Promise<NetWorth>;
};

const localDateCode = (value: Date) => [
  value.getFullYear(),
  String(value.getMonth() + 1).padStart(2, '0'),
  String(value.getDate()).padStart(2, '0'),
].join('-');

const monthLabel = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
  month: 'long',
  year: 'numeric',
});

const dateLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const snapshotTotal = (snapshot: MonthlyNetWorthSnapshot) => Object.values(snapshot.accountValues)
  .reduce((total, account) => total + account.value, 0) + (snapshot.homeEquity ?? 0);

const parseMoney = (rawValue: string) => {
  const normalized = rawValue.trim().replace(/[$,]/g, '');
  const parsed = normalized.startsWith('(') && normalized.endsWith(')')
    ? -Number(normalized.slice(1, -1))
    : Number(normalized);
  return normalized !== '' && Number.isFinite(parsed) ? parsed : undefined;
};

export function NetWorthSnapshotPanel({
  accounts,
  currentValues,
  homeEquity,
  includeHomeEquity,
  monthlySnapshots,
  formatMoney,
  onSave,
}: NetWorthSnapshotPanelProps) {
  const [draft, setDraft] = useState<SnapshotDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const editorHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const history = useMemo(() => Object.entries(monthlySnapshots).sort(([left], [right]) => right.localeCompare(left)), [monthlySnapshots]);

  const draftMonth = draft?.month;
  useEffect(() => { if (draftMonth) editorHeadingRef.current?.focus(); }, [draftMonth]);
  useEffect(() => { if (saveError) errorRef.current?.focus(); }, [saveError]);

  const rememberOrigin = () => {
    originRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const restoreOrigin = () => {
    window.requestAnimationFrame(() => originRef.current?.focus());
  };

  const closeDraft = () => {
    setDraft(null);
    setInvalidFields(new Set());
    restoreOrigin();
  };

  const setFieldValidity = (field: string, isValid: boolean) => setInvalidFields((current) => {
    const next = new Set(current);
    if (isValid) next.delete(field); else next.add(field);
    return next;
  });

  const beginCapture = () => {
    rememberOrigin();
    const asOfDate = localDateCode(new Date());
    const accountValues = Object.fromEntries(accounts.map((account) => [account.id, {
      accountName: account.name,
      value: currentValues.get(account.id) ?? 0,
    }]));
    setDraft({
      month: asOfDate.slice(0, 7),
      snapshot: {
        asOfDate,
        accountValues,
        ...(includeHomeEquity ? { homeEquity } : {}),
      },
      isFreshCapture: true,
    });
    setSaveError(null);
    setInvalidFields(new Set());
    setStatusMessage('');
  };

  const beginEdit = (month: string, snapshot: MonthlyNetWorthSnapshot) => {
    rememberOrigin();
    setDraft({
      month,
      snapshot: {
        ...snapshot,
        accountValues: Object.fromEntries(Object.entries(snapshot.accountValues).map(([id, value]) => [id, { ...value }])),
      },
      isFreshCapture: false,
    });
    setSaveError(null);
    setInvalidFields(new Set());
    setStatusMessage('');
  };

  const updateAccountValue = (accountId: string, rawValue: string) => {
    const value = parseMoney(rawValue);
    setFieldValidity(accountId, value !== undefined);
    if (value === undefined) return;
    setDraft((current) => current ? {
      ...current,
      snapshot: {
        ...current.snapshot,
        accountValues: {
          ...current.snapshot.accountValues,
          [accountId]: { ...current.snapshot.accountValues[accountId], value },
        },
      },
    } : current);
    setSaveError(null);
  };

  const saveDraft = async () => {
    if (!draft || isSaving) return;
    const replacesMonth = draft.isFreshCapture && Boolean(monthlySnapshots[draft.month]);
    if (replacesMonth && !window.confirm(`Replace ${monthLabel(draft.month)} snapshot? This replaces the entire saved snapshot for this month.`)) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(draft.month, draft.snapshot);
      setStatusMessage(`${monthLabel(draft.month)} snapshot ${replacesMonth ? 'replaced' : 'saved'}.`);
      setDraft(null);
      restoreOrigin();
    } catch {
      setSaveError("We couldn't save this snapshot. Your changes are still here. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const todayMonth = localDateCode(new Date()).slice(0, 7);
  const actionLabel = monthlySnapshots[todayMonth]
    ? `Update ${monthLabel(todayMonth)} snapshot`
    : `Take ${monthLabel(todayMonth)} snapshot`;

  return (
    <section aria-labelledby="net-worth-snapshots-title" style={{ border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 16, padding: 16, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 id="net-worth-snapshots-title" style={{ fontSize: '1.05rem', margin: 0 }}>Net worth snapshots</h2>
          <p style={{ margin: '6px 0 0' }}>Save one editable record per month using the account values currently shown.</p>
        </div>
        <button className="primary-action" type="button" disabled={accounts.length === 0 || isSaving || Boolean(draft)} onClick={beginCapture}>
          <span className="material-symbols-outlined" aria-hidden="true">photo_camera</span>
          {actionLabel}
        </button>
      </div>

      <p aria-live="polite" style={{ margin: statusMessage ? '12px 0 0' : 0 }}>{statusMessage}</p>

      {draft ? (
        <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: 'var(--md-sys-color-surface-container)' }}>
          <h3 ref={editorHeadingRef} tabIndex={-1} style={{ marginTop: 0 }}>{monthLabel(draft.month)} snapshot</h3>
          <p>Captured {dateLabel(draft.snapshot.asOfDate)}. Changes here update this snapshot only, not your live accounts.</p>
          {draft.isFreshCapture && monthlySnapshots[draft.month] ? (
            <p role="status"><strong>A snapshot already exists for this month.</strong> Saving will replace the entire monthly snapshot; earlier months will not change.</p>
          ) : null}
          {saveError ? <p ref={errorRef} tabIndex={-1} role="alert" style={{ color: 'var(--md-sys-color-error)' }}>{saveError}</p> : null}
          <FinanceTable aria-label={`${monthLabel(draft.month)} snapshot values`} wrapperClassName="excel-table-fullwidth" style={{ width: '100%' }}>
            <thead><tr><FinanceTableHeaderCell>Account</FinanceTableHeaderCell><FinanceTableHeaderCell>Value</FinanceTableHeaderCell></tr></thead>
            <tbody>
              {Object.entries(draft.snapshot.accountValues).map(([accountId, accountValue]) => (
                <tr key={accountId}>
                  <td className="excel-bold-col">{accountValue.accountName}</td>
                  <td><FinanceMoneyCellInput aria-label={`${accountValue.accountName} snapshot value`} aria-invalid={invalidFields.has(accountId)} aria-describedby={invalidFields.has(accountId) ? `snapshot-error-${accountId}` : undefined} value={accountValue.value} formatValue={formatMoney} onValueChange={(value) => updateAccountValue(accountId, value)} />{invalidFields.has(accountId) ? <span id={`snapshot-error-${accountId}`} style={{ display: 'block', color: 'var(--md-sys-color-error)' }}>Enter a valid amount.</span> : null}</td>
                </tr>
              ))}
              {draft.snapshot.homeEquity !== undefined ? <tr><td className="excel-bold-col">Home equity</td><td><FinanceMoneyCellInput aria-label="Home equity snapshot value" aria-invalid={invalidFields.has('homeEquity')} aria-describedby={invalidFields.has('homeEquity') ? 'snapshot-error-home-equity' : undefined} value={draft.snapshot.homeEquity} formatValue={formatMoney} onValueChange={(rawValue) => {
                const value = parseMoney(rawValue);
                setFieldValidity('homeEquity', value !== undefined);
                if (value !== undefined) setDraft((current) => current ? { ...current, snapshot: { ...current.snapshot, homeEquity: value } } : current);
              }} />{invalidFields.has('homeEquity') ? <span id="snapshot-error-home-equity" style={{ display: 'block', color: 'var(--md-sys-color-error)' }}>Enter a valid amount.</span> : null}</td></tr> : null}
              <tr><td className="excel-bold-col">Net worth</td><td className="excel-bold-col"><FinanceMoneyCellValue value={snapshotTotal(draft.snapshot)} formatValue={formatMoney} /></td></tr>
            </tbody>
          </FinanceTable>
          {invalidFields.size > 0 ? <p role="alert">Correct the invalid snapshot values before saving.</p> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="secondary-action" type="button" disabled={isSaving} onClick={closeDraft}>Cancel</button>
            <button className="primary-action" type="button" disabled={isSaving || invalidFields.size > 0} onClick={() => void saveDraft()}>{isSaving ? 'Saving...' : draft.isFreshCapture && monthlySnapshots[draft.month] ? 'Replace snapshot' : 'Save snapshot'}</button>
          </div>
        </div>
      ) : null}

      {history.length === 0 ? <p style={{ marginBottom: 0 }}>No snapshots yet. Take a snapshot to start tracking your net worth by month.</p> : (
        <FinanceTable aria-label="Saved net worth snapshots" wrapperClassName="excel-table-fullwidth" wrapperStyle={{ marginTop: 16 }} style={{ width: '100%' }}>
          <thead><tr><FinanceTableHeaderCell>Month</FinanceTableHeaderCell><FinanceTableHeaderCell>Snapshot date</FinanceTableHeaderCell><FinanceTableHeaderCell>Net worth</FinanceTableHeaderCell><FinanceTableHeaderCell>Actions</FinanceTableHeaderCell></tr></thead>
          <tbody>{history.map(([month, snapshot]) => <tr key={month}>
            <td className="excel-bold-col">{monthLabel(month)}</td>
            <td>{dateLabel(snapshot.asOfDate)}</td>
            <td><FinanceMoneyCellValue value={snapshotTotal(snapshot)} formatValue={formatMoney} /></td>
            <td><button className="link-button" type="button" aria-label={`Edit ${monthLabel(month)} snapshot`} disabled={Boolean(draft)} onClick={() => beginEdit(month, snapshot)} style={{ minWidth: 32, minHeight: 32, padding: '4px 8px' }}>Edit</button></td>
          </tr>)}</tbody>
        </FinanceTable>
      )}
    </section>
  );
}