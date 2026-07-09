import { useEffect, useState } from 'react';
import { createAccountApiRepository } from './api/accountApiRepository';
import { loadSessionUser, logout } from './api/authApi';
import { createBudgetApiRepository } from './api/budgetApiRepository';
import { HttpClient } from './api/httpClient';
import { createHoldingApiRepository } from './api/holdingApiRepository';
import { createIncomeSourceApiRepository } from './api/incomeSourceApiRepository';
import { AuthPage } from './auth/AuthPage';
import type { AuthSession } from './auth/authTypes';
import { LandingPage } from './pages/LandingPage';
import './styles.css';

export function App() {
  const [session, setSession] = useState<AuthSession | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const user = await loadSessionUser();
        setSession({ user });
      } catch {
        setSession(undefined);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  if (isLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Secure Access</p>
          <h1>Loading Finance Companion</h1>
          <p>Checking your session before opening the budget workspace.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <AuthPage
        onAuthenticated={(nextSession) => {
          setSession(nextSession);
        }}
      />
    );
  }

  const client = new HttpClient();
  const incomeSourceRepository = createIncomeSourceApiRepository(client);
  const budgetRepository = createBudgetApiRepository(client);
  const accountRepository = createAccountApiRepository(client);
  const holdingRepository = createHoldingApiRepository(client);

  return (
    <>
      <div className="app-shell narrow-shell" style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12 }}>
        <button
          className="secondary-action"
          type="button"
          onClick={() => {
            void (async () => {
              await logout();
              setSession(undefined);
            })();
          }}
        >
          Sign out
        </button>
      </div>
      <LandingPage
        repository={incomeSourceRepository}
        budgetRepository={budgetRepository}
        accountRepository={accountRepository}
        holdingRepository={holdingRepository}
      />
    </>
  );
}
