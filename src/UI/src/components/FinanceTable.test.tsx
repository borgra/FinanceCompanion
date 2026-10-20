import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FinanceMoneyCellInput, FinanceTable } from './FinanceTable';

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
  it('uses one Tab stop per visible body cell and enters inputs directly with full selection on 1 press', async () => {
    const user = userEvent.setup();
    render(<TableFixture />);
    const opening = screen.getByText('Opening balance').closest('td')!;
    const amountInput = screen.getByRole('textbox', { name: 'Opening amount' }) as HTMLInputElement;
    const closing = screen.getByText('Closing balance').closest('td')!;
    const final = screen.getByText('Final cell').closest('td')!;

    opening.focus();
    await user.keyboard('{Tab}');
    expect(amountInput).toHaveFocus();
    expect(amountInput).toHaveSelection('123.45');
    await user.keyboard('{Tab}');
    expect(closing).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(amountInput).toHaveFocus();
    expect(amountInput).toHaveSelection('123.45');
    final.focus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'After table' })).toHaveFocus();
  });

  it('uses Enter and arrows to navigate between editable cells and select the full value on 1 press', async () => {
    function EditableGridFixture() {
      const [first, setFirst] = useState(120);
      const [second, setSecond] = useState(450);
      const fmt = (value: number) => `$${value.toFixed(2)}`;
      return (
        <FinanceTable aria-label="Editable grid">
          <tbody>
            <tr>
              <td>Row 1</td>
              <td>
                <FinanceMoneyCellInput
                  aria-label="Row 1 amount"
                  value={first}
                  formatValue={fmt}
                  onValueChange={(val) => setFirst(Number(val) || 0)}
                />
              </td>
            </tr>
            <tr>
              <td>Row 2</td>
              <td>
                <FinanceMoneyCellInput
                  aria-label="Row 2 amount"
                  value={second}
                  formatValue={fmt}
                  onValueChange={(val) => setSecond(Number(val) || 0)}
                />
              </td>
            </tr>
          </tbody>
        </FinanceTable>
      );
    }

    const user = userEvent.setup();
    render(<EditableGridFixture />);
    const row1Input = screen.getByRole('textbox', { name: 'Row 1 amount' }) as HTMLInputElement;
    const row2Input = screen.getByRole('textbox', { name: 'Row 2 amount' }) as HTMLInputElement;

    await user.click(row1Input);
    expect(row1Input).toHaveFocus();
    expect(row1Input).toHaveSelection('120');

    await user.keyboard('{Enter}');
    expect(row2Input).toHaveFocus();
    expect(row2Input).toHaveSelection('450');

    await user.keyboard('{ArrowUp}');
    expect(row1Input).toHaveFocus();
    expect(row1Input).toHaveSelection('120');

    await user.keyboard('{ArrowDown}');
    expect(row2Input).toHaveFocus();
    expect(row2Input).toHaveSelection('450');
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
