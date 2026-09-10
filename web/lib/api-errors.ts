type ApiErrorBody = {
  message?: string;
  errors?: { message: string; path?: (string | number)[] }[];
};

// Finance API's validation errors (nestjs-zod's ZodValidationPipe, as of
// Epic 7 S2) come back as { message: "Validation failed", errors: [{
// message, path }] } — not the old class-validator shape ({ message:
// string[] }). This project shows a single joined error message in the
// UI (no per-field display — deliberate scope decision, field-level
// errors belong to the reskin sub-project, not this one), so this
// helper is the one place that response shape is read from.
export async function extractApiErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const body: ApiErrorBody | null = await response.json().catch(() => null);

  if (body?.errors?.length) {
    return body.errors.map((e) => e.message).join(', ');
  }
  if (typeof body?.message === 'string') {
    return body.message;
  }
  return fallback;
}
