import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SavedWebResearch } from './SavedWebResearch';

describe('SavedWebResearch', () => {
  it('shows saved AI research with its original inline citations and clear evidence limits', async () => {
    const user = userEvent.setup();
    render(<SavedWebResearch evidence={{ kind: 'foundry_web_search', answer: 'JEPQ paid USD 0.45.', citations: [
      { url: 'https://issuer.example/distributions', title: 'Issuer distributions', start_index: 0, end_index: 4 },
    ] }} />);
    await user.click(screen.getByText('Saved AI research and citations'));
    expect(screen.getByText(/not a verbatim copy/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Issuer distributions' })).toHaveAttribute('href', 'https://issuer.example/distributions');
    const research = screen.getByRole('region', { name: 'Saved research text' });
    expect(research).toHaveTextContent('JEPQ paid USD 0.45.');
    expect(within(research).getByRole('link', { name: 'JEPQ' })).toHaveAttribute('href', 'https://issuer.example/distributions');
    expect(research).toHaveAttribute('tabindex', '0');
  });

  it('renders untrusted answer as text and ignores unsafe links and invalid offsets', async () => {
    const user = userEvent.setup();
    const answer = '<img src=x onerror=alert(1)> JEPQ';
    const { container } = render(<SavedWebResearch evidence={{ kind: 'foundry_web_search', answer, citations: [
      { url: 'javascript:alert(1)', title: 'Unsafe', start_index: 0, end_index: 4 },
      { url: 'https://issuer.example/distributions', title: 'Issuer distributions', start_index: -1, end_index: 5000 },
      null,
    ] }} />);
    await user.click(screen.getByText('Saved AI research and citations'));
    expect(screen.getByRole('region', { name: 'Saved research text' })).toHaveTextContent(answer);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('does not label old or malformed snapshots as web research', () => {
    const { container, rerender } = render(<SavedWebResearch evidence={undefined} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SavedWebResearch evidence={{ kind: 'foundry_web_search', answer: 42 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
