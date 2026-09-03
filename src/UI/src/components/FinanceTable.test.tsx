import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FinanceTable } from './FinanceTable';

function TableFixture() {
  return (
    <>
      <button type="button">Before table</button>
      <FinanceTable aria-label="Ledger">
        <thead>
          <tr>
            <th><button type="button">Header action</button></th>
            <th>Amount</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Opening balance</td>
            <td><input aria-label="Opening amount" defaultValue="123.45" /></td>
            <td>
              <button type="button">View details</button>
              <button type="button">Secondary action</button>
            </td>
            <td hidden>Hidden cell</td>
          </tr>
          <tr>
            <td>Closing balance</td>
            <td>
              <select aria-label="Closing status" defaultValue="balanced">
                <option value="balanced">Balanced</option>
                <option value="unbalanced">Unbalanced</option>
              </select>
            </td>
            <td>Final cell</td>
          </tr>
        </tbody>
      </FinanceTable>
      <button type="button">After table</button>
    </>
  );
}

describe('FinanceTable', () => {
  it('tabs through visible body cells in DOM order, focusing editors and selecting text values', async () => {
    const user = userEvent.setup();
    render(<TableFixture />);

    const openingCell = screen.getByText('Opening balance').closest('td')!;
    const openingAmount = screen.getByRole('textbox', { name: 'Opening amount' }) as HTMLInputElement;
    const viewDetails = screen.getByRole('button', { name: 'View details' });
    const secondaryAction = screen.getByRole('button', { name: 'Secondary action' });
    const closingCell = screen.getByText('Closing balance').closest('td')!;
    const closingStatus = screen.getByRole('combobox', { name: 'Closing status' });

    openingCell.focus();
    expect(openingCell).toHaveFocus();

    await user.keyboard('{Tab}');
    expect(openingAmount).toHaveFocus();
    expect(openingAmount).toHaveSelection(openingAmount.value);

    await user.keyboard('{Tab}');
    expect(viewDetails).toHaveFocus();

    await user.keyboard('{Tab}');
    expect(secondaryAction).toHaveFocus();

    await user.keyboard('{Tab}');
    expect(closingCell).toHaveFocus();

    await user.keyboard('{Tab}');
    expect(closingStatus).toHaveFocus();
  });

  it('keeps header actions native and does not trap focus at the first or last body cell', async () => {
    const user = userEvent.setup();
    render(<TableFixture />);

    const headerAction = screen.getByRole('button', { name: 'Header action' });
    const openingCell = screen.getByText('Opening balance').closest('td')!;
    const finalCell = screen.getByText('Final cell').closest('td')!;
    const afterTable = screen.getByRole('button', { name: 'After table' });

    headerAction.focus();
    await user.keyboard('{Tab}');
    expect(openingCell).toHaveFocus();

    openingCell.focus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(headerAction).toHaveFocus();

    finalCell.focus();
    await user.keyboard('{Tab}');
    expect(afterTable).toHaveFocus();
  });
});
