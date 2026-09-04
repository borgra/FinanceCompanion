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
  'email', 'number', 'password', 'search', 'tel', 'text', 'url',
]);

const isVisibleWithinTable = (element: HTMLElement, table: HTMLTableElement) => {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (current === table) return true;
    current = current.parentElement;
  }
  return false;
};

const isTableBodyCell = (cell: HTMLTableCellElement, table: HTMLTableElement) =>
  cell.closest('table') === table && cell.closest('tbody') !== null;

const restoreManagedTabIndexes = (managed: Map<HTMLElement, string | null>) => {
  for (const [element, original] of managed) {
    if (original === null) element.removeAttribute('tabindex');
    else element.setAttribute('tabindex', original);
  }
  managed.clear();
};

const manageTabIndex = (
  element: HTMLElement,
  value: number,
  managed: Map<HTMLElement, string | null>,
) => {
  if (!managed.has(element)) managed.set(element, element.getAttribute('tabindex'));
  element.tabIndex = value;
};

const selectTextLikeValue = (element: HTMLElement) => {
  const isTextInput = element instanceof HTMLInputElement
    && TEXT_LIKE_INPUT_TYPES.has(element.type);
  if (isTextInput || element instanceof HTMLTextAreaElement) element.select();
};

const isEditableControl = (element: HTMLElement) => (
  element instanceof HTMLTextAreaElement
  || element.isContentEditable
  || (element instanceof HTMLInputElement
    && !['button', 'checkbox', 'file', 'radio', 'reset', 'submit'].includes(element.type))
);

type CellPosition = { row: number; startColumn: number; endColumn: number };

const buildBodyGrid = (table: HTMLTableElement) => {
  const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].filter((row) =>
    row.closest('table') === table && isVisibleWithinTable(row, table),
  );
  const grid: HTMLTableCellElement[][] = [];
  const positions = new Map<HTMLTableCellElement, CellPosition>();
  const orderedCells: HTMLTableCellElement[] = [];

  rows.forEach((row, rowIndex) => {
    grid[rowIndex] ??= [];
    let columnIndex = 0;
    for (const cell of [...row.cells]) {
      if (!isTableBodyCell(cell, table) || !isVisibleWithinTable(cell, table)) continue;
      while (grid[rowIndex][columnIndex]) columnIndex += 1;
      const rowSpan = Math.max(cell.rowSpan, 1);
      const columnSpan = Math.max(cell.colSpan, 1);
      positions.set(cell, {
        row: rowIndex,
        startColumn: columnIndex,
        endColumn: columnIndex + columnSpan - 1,
      });
      orderedCells.push(cell);
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        grid[rowIndex + rowOffset] ??= [];
        for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
          grid[rowIndex + rowOffset][columnIndex + columnOffset] = cell;
        }
      }
      columnIndex += columnSpan;
    }
  });

  return { grid, orderedCells, positions };
};

/**
 * Makes each visible table-body cell one navigation stop. Tab traverses cells
 * in reading order; arrow keys follow the visual grid, including spans.
 * Enter/F2 enters controls within a cell and Escape returns to the cell.
 */
export function useTableBodyCellTabNavigation() {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [table, setTable] = useState<HTMLTableElement | null>(null);
  const managedTabIndexes = useRef(new Map<HTMLElement, string | null>());
  const interactionCell = useRef<HTMLTableCellElement | null>(null);

  const setTableRef = useCallback((element: HTMLTableElement | null) => {
    tableRef.current = element;
    setTable(element);
  }, []);

  const synchronizeTargets = useCallback(() => {
    const currentTable = tableRef.current;
    if (!currentTable) return;
    restoreManagedTabIndexes(managedTabIndexes.current);

    for (const cell of buildBodyGrid(currentTable).orderedCells) {
      manageTabIndex(cell, 0, managedTabIndexes.current);
      const focusables = [...cell.querySelectorAll<HTMLElement>(CELL_FOCUSABLE_SELECTOR)]
        .filter((element) => element.tabIndex >= 0 && isVisibleWithinTable(element, currentTable));
      for (const focusable of focusables) manageTabIndex(focusable, -1, managedTabIndexes.current);
    }
  }, []);

  useLayoutEffect(() => {
    if (!table) return undefined;
    synchronizeTargets();
    const observer = new MutationObserver(synchronizeTargets);
    observer.observe(table, {
      attributes: true,
      attributeFilter: ['aria-hidden', 'class', 'disabled', 'hidden', 'style'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [synchronizeTargets, table]);

  useEffect(() => () => restoreManagedTabIndexes(managedTabIndexes.current), []);

  const cellControls = useCallback((cell: HTMLTableCellElement) => {
    const currentTable = tableRef.current;
    if (!currentTable) return [];
    return [...managedTabIndexes.current.entries()]
      .filter(([element, original]) =>
        element !== cell
        && original !== '-1'
        && element.closest('td, th') === cell
        && element.closest('table') === currentTable
        && isVisibleWithinTable(element, currentTable),
      )
      .map(([element]) => element);
  }, []);

  const focusCell = useCallback((cell: HTMLTableCellElement) => {
    interactionCell.current = null;
    cell.focus();
  }, []);

  const onKeyDownCapture = useCallback((event: KeyboardEvent<HTMLTableElement>) => {
    if (event.defaultPrevented) return;
    const currentTable = tableRef.current;
    const eventTarget = event.target;
    if (!currentTable || !(eventTarget instanceof HTMLElement)) return;
    const sourceCell = eventTarget.closest<HTMLTableCellElement>('td, th');
    if (!sourceCell || !isTableBodyCell(sourceCell, currentTable)) return;

    const isInsideControl = eventTarget !== sourceCell;
    const controls = cellControls(sourceCell);

    if (event.key === 'Escape' && isInsideControl) {
      event.preventDefault();
      focusCell(sourceCell);
      return;
    }

    if ((event.key === 'Enter' || event.key === 'F2') && !isInsideControl) {
      const firstControl = controls[0];
      if (!firstControl) return;
      event.preventDefault();
      interactionCell.current = sourceCell;
      firstControl.focus();
      selectTextLikeValue(firstControl);
      return;
    }

    const { grid, orderedCells, positions } = buildBodyGrid(currentTable);
    const position = positions.get(sourceCell);
    if (!position) return;

    if (event.key === 'Tab') {
      if (interactionCell.current === sourceCell && isInsideControl) {
        const controlIndex = controls.indexOf(eventTarget);
        const nextControl = controls[controlIndex + (event.shiftKey ? -1 : 1)];
        if (nextControl) {
          event.preventDefault();
          nextControl.focus();
          selectTextLikeValue(nextControl);
          return;
        }
        interactionCell.current = null;
      }
      const cellIndex = orderedCells.indexOf(sourceCell);
      const nextCell = orderedCells[cellIndex + (event.shiftKey ? -1 : 1)];
      if (!nextCell) return;
      event.preventDefault();
      focusCell(nextCell);
      return;
    }

    if (event.key === 'Enter' && isInsideControl && isEditableControl(eventTarget)) {
      event.preventDefault();
      const nextCell = grid[position.row + 1]?.[position.startColumn];
      if (nextCell && nextCell !== sourceCell) focusCell(nextCell);
      else focusCell(sourceCell);
      return;
    }

    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    // Once a control has focus (through Enter/F2 or a pointer), its arrow-key
    // behavior belongs to that native control. Escape returns to cell browsing.
    if (isInsideControl) return;

    event.preventDefault();
    let destination: HTMLTableCellElement | undefined;
    if (event.key === 'ArrowLeft') destination = grid[position.row]?.[position.startColumn - 1];
    else if (event.key === 'ArrowRight') destination = grid[position.row]?.[position.endColumn + 1];
    else {
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      for (let row = position.row + direction; row >= 0 && row < grid.length; row += direction) {
        const candidate = grid[row]?.[position.startColumn];
        if (candidate && candidate !== sourceCell) {
          destination = candidate;
          break;
        }
      }
    }
    if (destination) focusCell(destination);
  }, [cellControls, focusCell]);

  return { ref: setTableRef, onKeyDownCapture };
}
