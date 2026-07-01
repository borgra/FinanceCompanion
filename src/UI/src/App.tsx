import { createMockIncomeSourceRepository } from './domain/incomeSourceRepository';
import { LandingPage } from './pages/LandingPage';
import './styles.css';

const incomeSourceRepository = createMockIncomeSourceRepository();

export function App() {
  return (
    <LandingPage
      repository={incomeSourceRepository}
    />
  );
}
