interface ValidationIssue {
  path?: unknown;
  message?: string;
  code?: string;
}

function fieldLabel(path: unknown): string {
  if (Array.isArray(path)) return path.map((p) => String(p)).join('. ');
  if (typeof path === 'string') return path;
  return '';
}

/**
 * Turn an IPC error into something an operator can read. Validation failures
 * arrive as a JSON array of zod issues (e.g. pageSize too large); showing that
 * raw would leave the till stuck behind a wall of braces.
 */
export function describeIpcError(error: unknown, fallback = 'Something went wrong'): string {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : error
          ? String(error)
          : '';
  if (!raw.trim()) return fallback;

  const trimmed = raw.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const issues = Array.isArray(parsed) ? parsed : [parsed];
      const lines = issues
        .filter((i): i is ValidationIssue => Boolean(i) && typeof i === 'object')
        .map((issue) => {
          const field = fieldLabel(issue.path);
          const message = issue.message ?? 'is invalid';
          return field ? `${field}: ${message}` : message;
        })
        .filter(Boolean);
      if (lines.length > 0) return lines.join('; ');
    } catch {
      // Not JSON after all — fall through to the raw text.
    }
  }
  return raw;
}
