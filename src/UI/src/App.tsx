import { createMockIncomeSourceRepository } from './domain/incomeSourceRepository';
import { IncomeSourcesPage } from './features/incomeSources/IncomeSourcesPage';
import './styles.css';

const incomeSourceRepository = createMockIncomeSourceRepository();

export function App() {
  return <IncomeSourcesPage repository={incomeSourceRepository} />;
}
