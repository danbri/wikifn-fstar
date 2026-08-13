export function ok(value) {
  return { ok: true, value };
}

export function err(code, message, path = ["$"], details = {}) {
  return {
    ok: false,
    error: { code, message, path, details }
  };
}

export function bind(result, f) {
  return result.ok ? f(result.value) : result;
}

export function mapResult(result, f) {
  return result.ok ? ok(f(result.value)) : result;
}

export function collectResults(results) {
  const values = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}

export function formatError(error) {
  const path = Array.isArray(error.path) ? error.path.join(".") : String(error.path);
  return `${error.code} at ${path}: ${error.message}`;
}
