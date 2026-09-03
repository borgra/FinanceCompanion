import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadSessionUser, logout } from './api/authApi';
import { HttpClient } from './api/httpClient';
import { loadWorkspace } from './api/workspaceApi';
import { createWorkspaceSession } from './api/workspaceSession';
import { AuthPage } from './auth/AuthPage';
import type { AuthSession } from './auth/authTypes';
import type { Workspace } from './domain/workspace';
import { LandingPage } from './pages/LandingPage';
import './styles.css';

export function App() {
  const [session, setSession] = useState<AuthSession | undefined>();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace | undefined>();
  const [workspaceError, setWorkspaceError] = useState<string | undefined>();
  const [workspaceLoadAttempt, setWorkspaceLoadAttempt] = useState(0);
  const workspaceRequestRef = useRef<{ key: string; request: Promise<Workspace> }>();
  const workspaceErrorHeadingRef = useRef<HTMLHeadingElement>(null);
  const workspaceShellRef = useRef<HTMLDivElement>(null);

  const clearSession = useCallback(() => {
    workspaceRequestRef.current = undefined;
    setSession(undefined);
    setWorkspace(undefined);
    setWorkspaceError(undefined);
  }, []);
  const client = useMemo(() => new HttpClient(undefined, clearSession), [clearSession]);

  useEffect(() => {
    void (async () => {
      try {
        const user = await loadSessionUser();
        setSession({ user });
      } catch {
        clearSession();
      } finally {
        setIsCheckingSession(false);
      }
    })();
  }, [clearSession]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setWorkspace(undefined);
    setWorkspaceError(undefined);
    const requestKey = `${session.user.id}:${workspaceLoadAttempt}`;
    if (workspaceRequestRef.current?.key !== requestKey) {
      workspaceRequestRef.current = { key: requestKey, request: loadWorkspace(client) };
    }

    void workspaceRequestRef.current.request
      .then((nextWorkspace) => {
        if (!cancelled) setWorkspace(nextWorkspace);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setWorkspaceError(error instanceof Error ? error.message : 'Unable to load your financial workspace.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, session, workspaceLoadAttempt]);

  const repositories = useMemo(
    () => workspace ? createWorkspaceSession(workspace, client) : undefined,
    [client, workspace],
  );

  useEffect(() => {
    if (workspaceError) workspaceErrorHeadingRef.current?.focus();
  }, [workspaceError]);

  useEffect(() => {
    if (workspace && repositories) workspaceShellRef.current?.focus();
  }, [repositories, workspace]);

  if (isCheckingSession) {
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
          setWorkspace(undefined);
        }}
      />
    );
  }

  if (workspaceError) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="workspace-error-heading">
          <p className="eyebrow">Workspace unavailable</p>
          <h1 id="workspace-error-heading" ref={workspaceErrorHeadingRef} tabIndex={-1}>We couldn't load your financial data</h1>
          <p role="alert">{workspaceError}</p>
          <button
            className="primary-action"
            type="button"
            onClick={() => setWorkspaceLoadAttempt((attempt) => attempt + 1)}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (!workspace || !repositories) {
    return (
      <main className="auth-shell" aria-busy="true">
        <section className="auth-card" role="status" aria-live="polite">
          <p className="eyebrow">Secure workspace</p>
          <h1>Loading your financial data</h1>
          <p>Bringing your accounts, budget, holdings, and plans into this session.</p>
        </section>
      </main>
    );
  }

  return (
    <div ref={workspaceShellRef} tabIndex={-1} aria-label="Financial workspace">
      <div className="app-shell narrow-shell" style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12 }}>
        <button
          className="secondary-action"
          type="button"
          onClick={() => {
            void (async () => {
              try {
                await logout();
              } finally {
                clearSession();
              }
            })();
          }}
        >
          Sign out
        </button>
      </div>
      <LandingPage
        repository={repositories.incomeSourceRepository}
        budgetRepository={repositories.budgetRepository}
        accountRepository={repositories.accountRepository}
        holdingRepository={repositories.holdingRepository}
        netWorthRepository={repositories.netWorthRepository}
        retirementPlanRepository={repositories.retirementPlanRepository}
      />
    </div>
  );
}
