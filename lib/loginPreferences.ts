export const REMEMBERED_LOGIN_EMAIL_KEY = "deployiq:remembered-login-email";

type LoginPreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readRememberedLoginEmail(storage: LoginPreferenceStorage) {
  try {
    const email = storage.getItem(REMEMBERED_LOGIN_EMAIL_KEY)?.trim() ?? "";
    return email || null;
  } catch {
    return null;
  }
}

export function persistRememberedLoginEmail(
  storage: LoginPreferenceStorage,
  email: string,
  remember: boolean,
) {
  try {
    const trimmedEmail = email.trim();
    if (remember && trimmedEmail) {
      storage.setItem(REMEMBERED_LOGIN_EMAIL_KEY, trimmedEmail);
      return;
    }
    storage.removeItem(REMEMBERED_LOGIN_EMAIL_KEY);
  } catch {
    // A blocked or unavailable storage preference must never affect sign-in.
  }
}
