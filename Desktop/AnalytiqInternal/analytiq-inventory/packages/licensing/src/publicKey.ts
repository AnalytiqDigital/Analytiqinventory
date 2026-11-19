// Public half of the Ed25519 license keypair. Run `pnpm --filter
// @analytiq/licensing keygen` once in the build environment to generate the
// private key (kept outside the repository) and populate this file.
//
// Shipping a build with an empty key means activation cannot be verified; the
// app still runs its 14-day trial and reports "This build has no license key".

export const LICENSE_PUBLIC_KEY = '';
