export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
}

/** True only for the single allowed address with a Google-verified email. */
export function isAllowedIdentity(identity: GoogleIdentity, allowedEmail: string): boolean {
  if (!allowedEmail) return false;
  return identity.emailVerified && identity.email.trim().toLowerCase() === allowedEmail.toLowerCase();
}
