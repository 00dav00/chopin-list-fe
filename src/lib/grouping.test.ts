import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import {
  GROUPING_RETRY_MESSAGE,
  groupingErrorMessage,
  mergeGroupedItems,
} from "./grouping";

describe("mergeGroupedItems", () => {
  it("uses the server order and keeps local items it didn't return", () => {
    const grouped = [{ id: "b" }, { id: "a" }];
    const local = [{ id: "a" }, { id: "new" }, { id: "b" }];

    expect(mergeGroupedItems(grouped, local).map((item) => item.id)).toEqual([
      "b",
      "a",
      "new",
    ]);
  });

  it("returns the server items when nothing is local-only", () => {
    const grouped = [{ id: "a" }];

    expect(mergeGroupedItems(grouped, [{ id: "a" }])).toEqual([{ id: "a" }]);
  });
});

describe("groupingErrorMessage", () => {
  it("stays silent on 401 so the global re-auth can take over", () => {
    expect(groupingErrorMessage(new ApiError(401, "x", "Unauthorized"))).toBeNull();
  });

  it.each([409, 422])("shows the server's copy for a %i refusal", (status) => {
    const detail = "Grouping is not set up yet: no groups are configured.";

    expect(groupingErrorMessage(new ApiError(status, "x", detail))).toBe(detail);
  });

  it.each([
    ["a 503", new ApiError(503, "x", "Couldn't group right now.")],
    ["a timeout", new DOMException("Aborted", "AbortError")],
    ["a network error", new TypeError("Failed to fetch")],
    ["a 409 without detail", new ApiError(409, "x")],
  ])("asks to try again for %s", (_label, err) => {
    expect(groupingErrorMessage(err)).toBe(GROUPING_RETRY_MESSAGE);
  });
});
