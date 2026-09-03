import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const CELL_FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(', ');

const TEXT_LIKE_INPUT_TYPES = new Set([
  'email',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'url',
]);

const isVisibleWithinTable = (element: HTMLElement, table: HTMLTableElement) => {
  let current: HTMLElement | null = element;

  while (current) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
    const computedStyle = window.getComputedStyle(current);
    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') return false;
    if (current === table) return true;
    current = current.parentElement;
  }

  return false;
};

const isTableBodyCell = (cell: HTMLTableCellElement, table: HTMLTableElement) =>
  cell.closest('table') === table && cell.closest('tbody') !== null;

const getCellFocusables = (cell: HTMLTableCellElement, table: HTMLTableElement) =>
  [...cell.querySelectorAll<HTMLElement>(CELL_FOCUSABLE_SELECTOR)].filter((element) => (
    element.tabIndex >= 0 && isVisibleWithinTable(element, table)
  ));

const restoreManagedTabIndexes = (managedTabIndexes: Map<HTMLElement, string | null>) => {
  for (const [element, originalTabIndex] of managedTabIndexes) {
    if (originalTabIndex === null) element.removeAttribute('tabindex');
    else element.setAttribute('tabindex', originalTabIndex);
  }
  managedTabIndexes.clear();
};

const setManagedTabIndex = (
  element: HTMLElement,
  tabIndex: number,
  managedTabIndexes: Map<HTMLElement, string | null>,
) => {
  if (!managedTabIndexes.has(element)) {
    managedTabIndexes.set(element, element.getAttribute('tabindex'));
  }
  element.tabIndex = tabIndex;
};

const tableBodyCells = (table: HTMLTableElement) =>
  [...table.querySelectorAll<HTMLTableCellElement>('tbody td, tbody th')].filter((cell) => (
    isTableBodyCell(cell, table) && isVisibleWithinTable(cell, table)
  ));

const cellNavigationTargets = (cell: HTMLTableCellElement, table: HTMLTableElement) => {
  const focusables = getCellFocusables(cell, table);
  return focusables.length > 0 ? focusables : [cell];
};

const selectTextLikeValue = (element: HTMLElement) => {
  const isTextInput = element instanceof HTMLInputElement
    && TEXT_LIKE_INPUT_TYPES.has(element.type);
  if (isTextInput || element instanceof HTMLTextAreaElement) {
    element.select();
  }
};

/**
 * Adds spreadsheet-like Tab navigation to a table body. Static cells are one
 * stop, while each visible enabled editor or action remains independently
 * reachable in DOM order.
 */
export function useTableBodyCellTabNavigation() {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [table, setTable] = useState<HTMLTableElement | null>(null);
  const managedTabIndexes = useRef(new Map<HTMLElement, string | null>());

  const setTableRef = useCallback((element: HTMLTableElement | null) => {
    tableRef.current = element;
    setTable(element);
  }, []);

  const synchronizeTargets = useCallback(() => {
    const currentTable = tableRef.current;
    if (!currentTable) return;

    restoreManagedTabIndexes(managedTabIndexes.current);

    for (const cell of tableBodyCells(currentTable)) {
      if (getCellFocusables(cell, currentTable).length === 0) {
        setManagedTabIndex(cell, 0, managedTabIndexes.current);
      }
    }
  }, []);

  useLayoutEffect(() => {
    if (!table) return undefined;

    synchronizeTargets();
    const observer = new MutationObserver(synchronizeTargets);
    observer.observe(table, {
      attributes: true,
      attributeFilter: ['class', 'disabled', 'hidden', 'style'],
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [synchronizeTargets, table]);

  useEffect(() => () => {
    restoreManagedTabIndexes(managedTabIndexes.current);
  }, []);

  const onKeyDownCapture = useCallback((event: KeyboardEvent<HTMLTableElement>) => {
    if (event.defaultPrevented || event.key !== 'Tab') return;

    const currentTable = tableRef.current;
    const eventTarget = event.target;
    if (!currentTable || !(eventTarget instanceof HTMLElement)) return;

    const sourceCell = eventTarget.closest<HTMLTableCellElement>('td, th');
    if (!sourceCell || !isTableBodyCell(sourceCell, currentTable)) return;

    const targets = tableBodyCells(currentTable).flatMap((cell) => cellNavigationTargets(cell, currentTable));
    const currentTargetIndex = targets.findIndex((target) => target === sourceCell || target.contains(eventTarget));
    if (currentTargetIndex < 0) return;

    const nextTarget = targets[currentTargetIndex + (event.shiftKey ? -1 : 1)];
    if (!nextTarget) return;

    event.preventDefault();
    nextTarget.focus();
    selectTextLikeValue(nextTarget);
  }, []);

  return { ref: setTableRef, onKeyDownCapture };
}
