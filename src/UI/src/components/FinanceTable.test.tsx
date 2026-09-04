import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FinanceTable } from './FinanceTable';

function TableFixture() {
  return (
    <>
      <button type="button">Before table</button>
      <FinanceTable aria-label="Ledger">
        <thead><tr><th><button type="button">Header action</button></th><th>Amount</th></tr></thead>
        <tbody>
          <tr>
            <td>Opening balance</td>
            <td><input aria-label="Opening amount" defaultValue="123.45" /><button type="button">Fill down</button></td>
            <td hidden>Hidden cell</td>
          </tr>
          <tr><td>Closing balance</td><td><button type="button" disabled>Unavailable</button>Final cell</td></tr>
        </tbody>
      </FinanceTable>
      <button type="button">After table</button>
    </>
  );
}

describe('FinanceTable', () => {
  it('uses exactly one Tab stop per visible body cell', async () => {
    const user = userEvent.setup();
    render(<TableFixture />);
    const opening = screen.getByText('Opening balance').closest('td')!;
    const amountCell = screen.getByRole('textbox', { name: 'Opening amount' }).closest('td')!;
    const closing = screen.getByText('Closing balance').closest('td')!;
    const final = screen.getByText('Final cell').closest('td')!;

    opening.focus();
    await user.keyboard('{Tab}');
    expect(amountCell).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(closing).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(amountCell).toHaveFocus();
    final.focus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'After table' })).toHaveFocus();
  });

  it('uses arrows to navigate the visual grid without wrapping', async () => {
    const user = userEvent.setup();
    render(
      <FinanceTable aria-label="Spanning grid"><tbody>
        <tr><td colSpan={2}>Wide</td><td>Top right</td></tr>
        <tr><td>Bottom left</td><td>Bottom middle</td><td>Bottom right</td></tr>
      </tbody></FinanceTable>,
    );
    const wide = screen.getByText('Wide').closest('td')!;
    const topRight = screen.getByText('Top right').closest('td')!;
    const bottomLeft = screen.getByText('Bottom left').closest('td')!;
    const bottomMiddle = screen.getByText('Bottom middle').closest('td')!;

    wide.focus();
    await user.keyboard('{ArrowRight}');
    expect(topRight).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByText('Bottom right').closest('td')).toHaveFocus();
    bottomMiddle.focus();
    await user.keyboard('{ArrowUp}');
    expect(wide).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(bottomLeft).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(bottomLeft).toHaveFocus();
  });

  it('enters nested controls on Enter, supports their native edit mode, and exits with Escape', async () => {
    const user = userEvent.setup();
    render(<TableFixture />);
    const input = screen.getByRole('textbox', { name: 'Opening amount' }) as HTMLInputElement;
    const cell = input.closest('td')!;
    cell.focus();
    await user.keyboard('{Enter}');
    expect(input).toHaveFocus();
    expect(input).toHaveSelection(input.value);
    await user.keyboard('{ArrowLeft}');
    expect(input).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(cell).toHaveFocus();
  });

  it('recomputes navigation after cells are dynamically revealed', async () => {
    function DynamicTable() {
      const [shown, setShown] = useState(false);
      return <><button type="button" onClick={() => setShown((current) => !current)}>Toggle</button><FinanceTable><tbody><tr><td>One</td><td aria-hidden={!shown}>Two</td><td>Three</td></tr></tbody></FinanceTable></>;
    }
    const user = userEvent.setup();
    render(<DynamicTable />);
    const one = screen.getByText('One').closest('td')!;
    one.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Three').closest('td')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    await waitFor(() => expect(screen.getByText('Two').closest('td')).toHaveAttribute('tabindex', '0'));
    one.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Two').closest('td')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    await waitFor(() => expect(screen.getByText('Two').closest('td')).not.toHaveAttribute('tabindex'));
  });

  it('does not consume Enter when a nested action button has focus', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<FinanceTable><tbody><tr><td>Label</td><td><button type="button" onClick={onAction}>Details</button></td></tr></tbody></FinanceTable>);
    const actionCell = screen.getByRole('button', { name: 'Details' }).closest('td')!;
    actionCell.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Details' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('composes caller capture handlers and respects prevented navigation', async () => {
    const user = userEvent.setup();
    const onKeyDownCapture = vi.fn((event: KeyboardEvent<HTMLTableElement>) => event.preventDefault());
    render(<FinanceTable onKeyDownCapture={onKeyDownCapture}><tbody><tr><td>One</td><td>Two</td></tr></tbody></FinanceTable>);
    const one = screen.getByText('One').closest('td')!;
    one.focus();
    await user.keyboard('{ArrowRight}');
    expect(onKeyDownCapture).toHaveBeenCalled();
    expect(one).toHaveFocus();
  });
});
