import { ApiError } from "./api";
import { getApiErrorMessage } from "./errors";

export const GROUPING_RETRY_MESSAGE =
  "Couldn't group right now. Try again in a moment.";

/**
 * The server's new order, plus any item this page holds that the server
 * didn't return (added while grouping ran). Those keep their own sort_order,
 * which sits above the grouped range, so they render at the end.
 */
export const mergeGroupedItems = <T extends { id: string }>(
  grouped: T[],
  local: T[]
): T[] => {
  const returned = new Set(grouped.map((item) => item.id));
  return [...grouped, ...local.filter((item) => !returned.has(item.id))];
};

/**
 * The server's own copy for a refusal (409/422), which is written for people.
 * Request-validation 422s carry a list instead, so only text is used.
 */
export const refusalDetail = (err: unknown): string | null =>
  err instanceof ApiError &&
  (err.status === 409 || err.status === 422) &&
  typeof err.detail === "string" &&
  err.detail
    ? err.detail
    : null;

/** A failed write, or null to stay silent (401 re-auth). For admin pages. */
export const failureMessage = (err: unknown, message: string): string | null =>
  getApiErrorMessage(err, message) ? message : null;

/**
 * Copy for a failed grouping, or null to stay silent (401 re-auth). Refusals
 * carry the server's copy; anything else is "try again".
 */
export const groupingErrorMessage = (err: unknown): string | null => {
  if (!getApiErrorMessage(err, GROUPING_RETRY_MESSAGE)) return null;
  return refusalDetail(err) ?? GROUPING_RETRY_MESSAGE;
};
