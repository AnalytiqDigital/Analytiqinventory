// Batch 1 placeholder. Signed licence tokens arrive in Batch 10.
// Desktop bundle must contain only the public verification key — never the
// private signing key or Paystack secret.
export interface LicenceInfo {
  kind: 'trial' | 'monthly' | 'annual';
  expiresAt: string;
}
