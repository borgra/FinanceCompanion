import type {
  ChangeEvent,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  ThHTMLAttributes,
} from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KeyboardNavigableTable } from './KeyboardNavigableTable';
import type { TableBodyCellNavigationOptions } from './useTableBodyCellTabNavigation';

type FinanceTableProps = TableHTMLAttributes<HTMLTableElement>
  & TableBodyCellNavigationOptions
  & {
    children: ReactNode;
    variant?: 'spreadsheet' | 'plain';
    wrapperClassName?: string;
    wrapperStyle?: CSSProperties;
  };

type FinanceTableHeaderCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode;
  contentClassName?: string;
  icon?: string;
  isEditable?: boolean;
  isMoveLeftDisabled?: boolean;
  isMoveRightDisabled?: boolean;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  showFilterArrow?: boolean;
};

type FinanceMoneyCellInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value'
> & {
  fillDownLabel?: string;
  focusId?: string;
  formatValue: (value: number) => string;
  /** @deprecated Navigation is owned by KeyboardNavigableTable. */
  nextFocusId?: string;
  onFillDown?: (value: string) => void;
  onValueChange: (value: string) => void;
  value: number;
};

type FinanceMoneyCellValueProps = {
  className?: string;
  formatValue: (value: number) => string;
  value: number;
};

const joinClassNames = (...classNames: Array<string | undefined>) =>
  classNames.filter(Boolean).join(' ');

export function useFinanceTableRowRetention(currentRowCount = 0) {
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [minRowCount, setMinRowCount] = useState(0);
  const rowCountRef = useRef(currentRowCount);
  rowCountRef.current = currentRowCount;

  const syncRowCount = useCallback((count: number) => {
    rowCountRef.current = count;
  }, []);

  const onCellEditStateChange = useCallback((isEditing: boolean) => {
    setMinRowCount((current) => (isEditing ? Math.max(current, rowCountRef.current) : 0));
  }, []);

  const clearRetention = useCallback(() => {
    setActiveRowKey(null);
    setMinRowCount(0);
  }, []);

  return {
    activeRowKey,
    clearRetention,
    minRowCount,
    syncRowCount,
    tableProps: {
      onActiveRowKeyChange: setActiveRowKey,
      onCellEditStateChange,
    },
  };
}

export function FinanceTable({
  children,
  className,
  variant = 'spreadsheet',
  wrapperClassName,
  wrapperStyle,
  onKeyDownCapture,
  ...tableProps
}: FinanceTableProps) {
  const table = (
    <KeyboardNavigableTable
      className={joinClassNames(variant === 'spreadsheet' ? 'excel-table' : undefined, className)}
      {...tableProps}
      onKeyDownCapture={onKeyDownCapture}
    >
      {children}
    </KeyboardNavigableTable>
  );

  if (variant === 'plain') {
    return wrapperClassName || wrapperStyle ? (
      <div className={wrapperClassName} style={wrapperStyle}>
        {table}
      </div>
    ) : (
      table
    );
  }

  return (
    <div className={joinClassNames('excel-wrapper', wrapperClassName)} style={wrapperStyle}>
      {table}
    </div>
  );
}

export function FinanceTableHeaderCell({
  children,
  contentClassName,
  icon,
  isEditable = false,
  isMoveLeftDisabled = false,
  isMoveRightDisabled = false,
  onMoveLeft,
  onMoveRight,
  onRemove,
  removeLabel,
  showFilterArrow = false,
  ...headerProps
}: FinanceTableHeaderCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const hasColumnActions = Boolean(onMoveLeft || onMoveRight || onRemove);
  const childText = typeof children === 'string' ? children : 'column';
  const leftLabel = `Move ${childText} left`;
  const rightLabel = `Move ${childText} right`;
  const resolvedRemoveLabel = removeLabel ?? `Remove ${childText}`;

  return (
    <th
      {...headerProps}
      className={joinClassNames(
        headerProps.className,
        isEditable || hasColumnActions ? 'excel-col-editable-header' : undefined,
      )}
      onMouseEnter={(event) => {
        setIsHovered(true);
        headerProps.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setIsHovered(false);
        headerProps.onMouseLeave?.(event);
      }}
    >
      <div
        className={joinClassNames(
          'excel-th-content',
          isEditable || hasColumnActions ? 'excel-th-editable-content' : undefined,
          contentClassName,
        )}
        style={hasColumnActions ? { gap: '4px' } : undefined}
      >
        {onMoveLeft ? (
          <button
            className="link-button"
            type="button"
            aria-label={leftLabel}
            disabled={isMoveLeftDisabled}
            onClick={onMoveLeft}
            style={{
              minHeight: 'auto',
              padding: 0,
              visibility: isHovered ? 'visible' : 'hidden',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
              chevron_left
            </span>
          </button>
        ) : null}
        {icon ? (
          <span
            aria-hidden="true"
            className="material-symbols-outlined"
            style={{ fontSize: '13px' }}
          >
            {icon}
          </span>
        ) : null}
        <span>{children}</span>
        {onRemove ? (
          <button
            className="link-button"
            type="button"
            aria-label={resolvedRemoveLabel}
            onClick={onRemove}
            style={{ minHeight: 'auto', padding: 0 }}
          >
            <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>[x]</span>
          </button>
        ) : null}
        {onMoveRight ? (
          <button
            className="link-button"
            type="button"
            aria-label={rightLabel}
            disabled={isMoveRightDisabled}
            onClick={onMoveRight}
            style={{
              minHeight: 'auto',
              padding: 0,
              visibility: isHovered ? 'visible' : 'hidden',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
              chevron_right
            </span>
          </button>
        ) : null}
        {showFilterArrow ? <span className="excel-filter-arrow">▾</span> : null}
      </div>
    </th>
  );
}

export function FinanceMoneyCellInput({
  className,
  fillDownLabel,
  focusId,
  formatValue,
  nextFocusId: _nextFocusId,
  onBlur,
  onFillDown,
  onFocus,
  onMouseUp,
  onValueChange,
  value,
  ...inputProps
}: FinanceMoneyCellInputProps) {
  void _nextFocusId;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shouldSelectOnFocusRef = useRef(false);
  const preserveSelectionOnMouseUpRef = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const [draftValue, setDraftValue] = useState(value === 0 ? '' : String(value));

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(value === 0 ? '' : String(value));
    }
  }, [isFocused, value]);

  useLayoutEffect(() => {
    if (isFocused && shouldSelectOnFocusRef.current) {
      shouldSelectOnFocusRef.current = false;
      inputRef.current?.select();
    }
  }, [isFocused, draftValue]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftValue(event.target.value);
    onValueChange(event.target.value);
  };

  return (
    <div className="excel-editable-cell">
      <input
        {...inputProps}
        ref={inputRef}
        className={joinClassNames('excel-cell-input', className)}
        data-ledger-cell={focusId}
        inputMode={inputProps.inputMode ?? 'decimal'}
        value={isFocused ? draftValue : formatValue(value)}
        onChange={handleChange}
        onClick={(event) => {
          event.currentTarget.select();
          inputProps.onClick?.(event);
        }}
        onMouseUp={(event) => {
          if (preserveSelectionOnMouseUpRef.current) {
            preserveSelectionOnMouseUpRef.current = false;
            event.preventDefault();
            event.currentTarget.select();
          }
          onMouseUp?.(event);
        }}
        onFocus={(event) => {
          shouldSelectOnFocusRef.current = true;
          preserveSelectionOnMouseUpRef.current = true;
          setIsFocused(true);
          setDraftValue(value === 0 ? '' : String(value));
          event.currentTarget.select();
          onFocus?.(event);
        }}
        onBlur={(event) => {
          shouldSelectOnFocusRef.current = false;
          preserveSelectionOnMouseUpRef.current = false;
          setIsFocused(false);
          onBlur?.(event);
        }}
        style={isFocused && onFillDown ? { paddingLeft: '22px' } : undefined}
      />
      {isFocused && onFillDown ? (
        <button
          type="button"
          className="link-button"
          data-cell-auxiliary="true"
          tabIndex={-1}
          aria-label={fillDownLabel}
          title={fillDownLabel}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFillDown(draftValue)}
          style={{
            position: 'absolute',
            left: '2px',
            top: '50%',
            transform: 'translateY(-50%)',
            minHeight: '18px',
            width: '18px',
            padding: 0,
            color: 'var(--md-sys-color-primary)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
            keyboard_double_arrow_down
          </span>
        </button>
      ) : null}
    </div>
  );
}

export function FinanceCellInput({
  className,
  onClick,
  onFocus,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="excel-editable-cell">
      <input
        {...inputProps}
        className={joinClassNames('excel-cell-input', className)}
        onClick={(event) => {
          event.currentTarget.select();
          onClick?.(event);
        }}
        onFocus={(event) => {
          event.currentTarget.select();
          onFocus?.(event);
        }}
      />
    </div>
  );
}

export function FinanceMoneyCellValue({
  className,
  formatValue,
  value,
}: FinanceMoneyCellValueProps) {
  return (
    <span className={joinClassNames('excel-cell-val', className)}>
      {formatValue(value)}
    </span>
  );
}

