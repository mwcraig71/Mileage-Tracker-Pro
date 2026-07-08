import type { Response } from "express";
import type { ZodType } from "zod";

/**
 * Parse `body` against a Zod schema. On success returns the typed value.
 * On failure writes a 400 `{ error: <flattened message> }` response and
 * returns undefined — callers must `return` when the result is undefined.
 */
export function parseBody<T>(
  schema: ZodType<T>,
  body: unknown,
  res: Response,
): T | undefined {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ error: flattenZodError(result.error) });
    return undefined;
  }
  return result.data;
}

/** Turn a ZodError into a short human-readable string. */
export function flattenZodError(error: {
  flatten: () => {
    formErrors: string[];
    fieldErrors: Record<string, string[] | undefined>;
  };
}): string {
  const flat = error.flatten();
  const parts: string[] = [...flat.formErrors];
  for (const [field, msgs] of Object.entries(flat.fieldErrors)) {
    if (msgs && msgs.length) parts.push(`${field}: ${msgs.join(", ")}`);
  }
  return parts.length ? parts.join("; ") : "Invalid request body";
}
