import type { ReactNode, TableHTMLAttributes } from 'react';
import { useTableBodyCellTabNavigation } from './useTableBodyCellTabNavigation';

type KeyboardNavigableTableProps = TableHTMLAttributes<HTMLTableElement> & {
  children: ReactNode;
};

export function KeyboardNavigableTable({
  children,
  className,
  onKeyDownCapture,
  ...tableProps
}: KeyboardNavigableTableProps) {
  const navigation = useTableBodyCellTabNavigation();

  return (
    <table
      {...tableProps}
      className={['keyboard-navigable-table', className].filter(Boolean).join(' ')}
      ref={navigation.ref}
      onKeyDownCapture={(event) => {
        onKeyDownCapture?.(event);
        navigation.onKeyDownCapture(event);
      }}
    >
      {children}
    </table>
  );
}
