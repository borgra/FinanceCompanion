import { LogLevel, type AuthenticationResult, PublicClientApplication } from '@azure/msal-browser';

const entraClientId = (import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined) ?? '';
const entraTenantId = (import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined) ?? '';
const entraRedirectUri =
  (import.meta.env.VITE_ENTRA_REDIRECT_URI as string | undefined) ?? window.location.origin;

let msalClientPromise: Promise<PublicClientApplication> | undefined;

function createMsalClient() {
  const application = new PublicClientApplication({
    auth: {
      clientId: entraClientId,
      authority: `https://login.microsoftonline.com/${entraTenantId}`,
      redirectUri: entraRedirectUri,
      postLogoutRedirectUri: entraRedirectUri,
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return;
          if (level === LogLevel.Error) console.error(message);
          if (level === LogLevel.Warning) console.warn(message);
        },
        piiLoggingEnabled: false,
      },
    },
  });

  return application;
}

async function getMsalClient() {
  if (!msalClientPromise) {
    msalClientPromise = (async () => {
      const application = createMsalClient();
      await application.initialize();
      await application.handleRedirectPromise();
      return application;
    })();
  }

  return msalClientPromise;
}

export function getEntraConfigurationError(): string | undefined {
  if (!entraClientId) return 'Missing `VITE_ENTRA_CLIENT_ID`. Add it before using Microsoft sign-in.';
  if (!entraTenantId) return 'Missing `VITE_ENTRA_TENANT_ID`. Add it before using Microsoft sign-in.';
  return undefined;
}

export async function signInWithEntra(): Promise<AuthenticationResult> {
  const configError = getEntraConfigurationError();
  if (configError) {
    throw new Error(configError);
  }

  const application = await getMsalClient();
  return application.loginPopup({
    scopes: ['openid', 'profile', 'email'],
    prompt: 'select_account',
  });
}
