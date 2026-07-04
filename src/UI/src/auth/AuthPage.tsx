import { useState } from 'react';
import { ApiError } from '../api/httpClient';
import type { AuthSession } from './authTypes';
import { verifyEntraIdToken } from '../api/authApi';
import { getEntraConfigurationError, signInWithEntra } from './entraAuth';

type AuthPageProps = {
  onAuthenticated: (session: AuthSession) => void;
};

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const configurationError = getEntraConfigurationError();

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-label="Authentication">
        <p className="eyebrow">Secure Access</p>
        <h1>Sign in to Finance Companion</h1>
        <p>
          Use your approved Microsoft account to load your budget, accounts, and income configuration.
        </p>

        {configurationError ? (
          <div className="alert error-alert" role="alert">
            <span>{configurationError}</span>
          </div>
        ) : null}

        {error ? (
          <div className="alert error-alert" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        <div className="auth-actions">
          <button
            className="primary-action"
            type="button"
            disabled={isLoading || Boolean(configurationError)}
            onClick={() => {
              void (async () => {
                setIsLoading(true);
                setError(undefined);
                try {
                  const result = await signInWithEntra();
                  if (!result.idToken) {
                    throw new Error('Microsoft did not return an ID token.');
                  }

                  const session = await verifyEntraIdToken(result.idToken);
                  onAuthenticated(session);
                } catch (error) {
                  if (error instanceof ApiError) {
                    setError(error.message);
                  } else if (error instanceof Error && error.message) {
                    setError(error.message);
                  } else {
                    setError('Sign-in failed. Confirm the approved Microsoft account and try again.');
                  }
                } finally {
                  setIsLoading(false);
                }
              })();
            }}
          >
            Sign in with Microsoft
          </button>
          {isLoading ? <p>Verifying account...</p> : null}
        </div>
      </section>
    </main>
  );
}
