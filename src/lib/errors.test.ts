import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { getApiErrorMessage } from "./errors";

describe("getApiErrorMessage", () => {
  it("returns null for unauthorized ApiError", () => {
    const err = new ApiError(401, "API request failed", "Unauthorized");
    expect(getApiErrorMessage(err, "Fallback")).toBeNull();
  });

  it("returns API detail/message for non-401 ApiError", () => {
    const err = new ApiError(400, "API request failed", "Bad request");
    expect(getApiErrorMessage(err, "Fallback")).toBe("Bad request");
  });

  it("returns fallback for non-ApiError values", () => {
    expect(getApiErrorMessage(new Error("oops"), "Fallback")).toBe("Fallback");
  });
});
