import { waitFor } from "@testing-library/svelte";
import { expect } from "vitest";

export const setRoute = (path: string) => {
  window.location.hash = `#${path}`;
  window.dispatchEvent(new Event("hashchange"));
};

export const getRoute = () => window.location.hash.replace(/^#/, "") || "/";

export const waitForRoute = async (path: string) => {
  await waitFor(() => {
    expect(getRoute()).toBe(path);
  });
};
