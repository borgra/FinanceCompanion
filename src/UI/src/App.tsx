import { createMockIncomeSourceRepository } from './domain/incomeSourceRepository';
import { createMockBudgetRepository } from './domain/budgetRepository';
import { LandingPage } from './pages/LandingPage';
import './styles.css';

const incomeSourceRepository = createMockIncomeSourceRepository({
  initialSources: [
    {
      id: 'income-source-primary',
      name: 'Primary job',
      type: 'Salary',
      cadence: 'Bi-weekly',
      periods: [
        {
          id: 'primary-period',
          startDate: '2026-01-01',
          yearlyGrossAmount: 120000,
          netPercentage: 75,
        },
      ],
      status: 'Active',
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    },
    {
      id: 'income-source-side',
      name: 'Side income',
      type: 'Salary',
      cadence: 'Bi-weekly',
      periods: [
        {
          id: 'side-period',
          startDate: '2026-01-01',
          yearlyGrossAmount: 30000,
          netPercentage: 50,
        },
      ],
      status: 'Active',
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    },
  ],
});
const budgetRepository = createMockBudgetRepository();

export function App() {
  return (
    <LandingPage
      repository={incomeSourceRepository}
      budgetRepository={budgetRepository}
    />
  );
}
