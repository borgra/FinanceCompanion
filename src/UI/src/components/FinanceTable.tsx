import type {
  ChangeEvent,
  CSSProperties,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
  TableHTMLAttributes,
  ThHTMLAttributes,
} from 'react';
import { useEffect, useState } from 'react';

type FinanceTableProps = TableHTMLAttributes<HTMLTableElement> & {
  children: ReactNode;
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

export function FinanceTable({
  children,
  className,
  wrapperClassName,
  wrapperStyle,
  ...tableProps
}: FinanceTableProps) {
  return (
    <div className={joinClassNames('excel-wrapper', wrapperClassName)} style={wrapperStyle}>
      <table className={joinClassNames('excel-table', className)} {...tableProps}>
        {children}
      </table>
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
  nextFocusId,
  onBlur,
  onFillDown,
  onFocus,
  onValueChange,
  value,
  ...inputProps
}: FinanceMoneyCellInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [draftValue, setDraftValue] = useState(value === 0 ? '' : String(value));

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(value === 0 ? '' : String(value));
    }
  }, [isFocused, value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftValue(event.target.value);
    onValueChange(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    inputProps.onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Enter') return;

    event.preventDefault();
    setIsFocused(false);

    if (nextFocusId) {
      window.requestAnimationFrame(() => {
        const nextInput = document.querySelector<HTMLInputElement>(
          `[data-ledger-cell="${nextFocusId}"]`,
        );
        nextInput?.focus();
      });
    }
  };

  return (
    <div className="excel-editable-cell">
      <input
        {...inputProps}
        className={joinClassNames('excel-cell-input', className)}
        data-ledger-cell={focusId}
        inputMode={inputProps.inputMode ?? 'decimal'}
        value={isFocused ? draftValue : formatValue(value)}
        onChange={handleChange}
        onClick={(event) => {
          event.currentTarget.select();
          inputProps.onClick?.(event);
        }}
        onFocus={(event) => {
          setIsFocused(true);
          setDraftValue(value === 0 ? '' : String(value));
          event.currentTarget.select();
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        onKeyDown={handleKeyDown}
        style={isFocused && onFillDown ? { paddingLeft: '22px' } : undefined}
      />
      {isFocused && onFillDown ? (
        <button
          type="button"
          className="link-button"
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
