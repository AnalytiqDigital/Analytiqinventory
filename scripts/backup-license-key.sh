#!/usr/bin/env bash
# Makes an AES-256 encrypted backup of the licence private key.
# Run it yourself so the password never touches shell history or logs:
#   bash scripts/backup-license-key.sh [output-file]
# Then copy the .enc file to an encrypted USB drive and keep the password in a
# password manager. Restore with:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <file>.enc -out license-private.pem
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
key="$root/.secrets/license-private.pem"
out="${1:-$HOME/Desktop/analytiq-license-private-$(date +%Y%m%d).pem.enc}"
# Accept a Windows-style path when launched from cmd.exe via the .cmd wrapper.
if command -v cygpath >/dev/null 2>&1 && [[ "$out" == [A-Za-z]:* || "$out" == *\\* ]]; then
  out="$(cygpath -u "$out")"
fi

if [ ! -f "$key" ]; then
  echo "Missing $key - nothing to back up." >&2
  exit 1
fi
if [ -e "$out" ]; then
  echo "$out already exists; move or delete it first." >&2
  exit 1
fi

read -r -s -p "Choose a strong backup password (16+ characters): " pass; echo
read -r -s -p "Repeat the password: " pass2; echo
if [ "$pass" != "$pass2" ]; then
  echo "Passwords do not match." >&2
  exit 1
fi
if [ "${#pass}" -lt 16 ]; then
  echo "Use at least 16 characters." >&2
  exit 1
fi

umask 077
printf '%s' "$pass" |
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in "$key" -out "$out" -pass stdin

# Prove the archive decrypts back to the original before declaring success.
if ! printf '%s' "$pass" |
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$out" -pass stdin | cmp -s - "$key"; then
  echo "Verification failed - delete $out and try again." >&2
  exit 1
fi

echo
echo "Encrypted backup written to: $out"
echo "Next steps:"
echo "  1. Copy it to an encrypted USB drive (or a second encrypted archive elsewhere)."
echo "  2. Store the password in a password manager - it is the only way to restore."
echo "  3. Never email, chat, or cloud-sync either the .enc file or the password unencrypted."
