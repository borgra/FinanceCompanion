export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  pictureUrl?: string | null;
};

export type AuthSession = {
  user: AuthUser;
};
