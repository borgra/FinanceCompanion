import type { ReactNode, TableHTMLAttributes } from 'react';
import {
  useTableBodyCellTabNavigation,
  type TableBodyCellNavigationOptions,
} from './useTableBodyCellTabNavigation';

export type KeyboardNavigableTableProps = TableHTMLAttributes<HTMLTableElement>
  & TableBodyCellNavigationOptions
  & {
    children: ReactNode;
  };

export function KeyboardNavigableTable({
  children,
  className,
  onActiveRowKeyChange,
  onBlurCapture,
  onCellEditStateChange,
  onClickCapture,
  onFocusCapture,
  onKeyDownCapture,
  onMouseUpCapture,
  ...tableProps
}: KeyboardNavigableTableProps) {
  const navigation = useTableBodyCellTabNavigation({
    onActiveRowKeyChange,
    onCellEditStateChange,
  });

  return (
    <table
      {...tableProps}
      className={['keyboard-navigable-table', className].filter(Boolean).join(' ')}
      ref={navigation.ref}
      onBlurCapture={(event) => {
        onBlurCapture?.(event);
        navigation.onBlurCapture(event);
      }}
      onClickCapture={(event) => {
        onClickCapture?.(event);
        navigation.onClickCapture(event);
      }}
      onFocusCapture={(event) => {
        onFocusCapture?.(event);
        navigation.onFocusCapture(event);
      }}
      onKeyDownCapture={(event) => {
        onKeyDownCapture?.(event);
        navigation.onKeyDownCapture(event);
      }}
      onMouseUpCapture={(event) => {
        onMouseUpCapture?.(event);
        navigation.onMouseUpCapture(event);
      }}
    >
      {children}
    </table>
  );
}
