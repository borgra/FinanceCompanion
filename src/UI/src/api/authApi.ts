import type { AuthSession, AuthUser } from '../auth/authTypes';
import { HttpClient } from './httpClient';

const unauthenticatedClient = new HttpClient();

type VerifyIdentityResponse = {
  user: AuthUser;
};

export async function verifyEntraIdToken(idToken: string): Promise<AuthSession> {
  const response = await unauthenticatedClient.post<VerifyIdentityResponse>('/auth/entra/verify', {
    idToken,
  });
  return response;
}

export async function loadSessionUser(): Promise<AuthUser> {
  const client = new HttpClient();
  return client.get<AuthUser>('/auth/session');
}

export async function logout(): Promise<void> {
  await unauthenticatedClient.post<void>('/auth/logout');
}
