import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Lists from "./Lists.svelte";
import Templates from "./Templates.svelte";
import type { ListOut, TemplateOut } from "../lib/types";
import { makeList, makeTemplate, makeTemplateDetail } from "../test/utils/factories";

const { pushMock, apiMock, TestApiError } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiMock: {
    getMe: vi.fn(),
    listLists: vi.fn(),
    createList: vi.fn(),
    deleteList: vi.fn(),
    listTemplates: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    createListFromTemplate: vi.fn(),
  },
  TestApiError: class extends Error {
    status: number;
    detail?: string;

    constructor(status: number, message = "API request failed", detail?: string) {
      super(message);
      this.status = status;
      this.detail = detail;
    }
  },
}));

vi.mock("svelte-spa-router", () => ({
  push: pushMock,
}));

vi.mock("../lib/api", () => ({
  ApiError: TestApiError,
  api: apiMock,
  setAuthTokenGetter: vi.fn(),
}));

type CollectionConfig = {
  name: string;
  component: typeof Lists | typeof Templates;
  loadMock: ReturnType<typeof vi.fn>;
  createMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
  inputPlaceholder: string;
  createButtonLabel: string;
  emptyStateText: string;
  buildCreatePayload: (name: string) => unknown;
  makeExistingEntity: () => ListOut | TemplateOut;
  makeCreatedEntity: (name: string) => unknown;
};

const collectionConfigs: CollectionConfig[] = [
  {
    name: "Lists",
    component: Lists,
    loadMock: apiMock.listLists,
    createMock: apiMock.createList,
    deleteMock: apiMock.deleteList,
    inputPlaceholder: "New list name",
    createButtonLabel: "Create list",
    emptyStateText: "No lists yet",
    buildCreatePayload: (name) => ({ name }),
    makeExistingEntity: () =>
      makeList({
        id: "list-existing",
        name: "Family groceries",
        items_count: 3,
      }),
    makeCreatedEntity: (name) =>
      makeList({
        id: "list-created",
        name,
      }),
  },
  {
    name: "Templates",
    component: Templates,
    loadMock: apiMock.listTemplates,
    createMock: apiMock.createTemplate,
    deleteMock: apiMock.deleteTemplate,
    inputPlaceholder: "New template name",
    createButtonLabel: "Create template",
    emptyStateText: "No templates yet",
    buildCreatePayload: (name) => ({ name, items: [] }),
    makeExistingEntity: () =>
      makeTemplate({
        id: "template-existing",
        name: "Bulk shopping",
        items_count: 4,
      }),
    makeCreatedEntity: (name) =>
      makeTemplateDetail({
        id: "template-created",
        name,
        items: [],
      }),
  },
];

const resetApiMocks = () => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
};

describe.each(collectionConfigs)("$name route", (config) => {
  beforeEach(() => {
    resetApiMocks();
    pushMock.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("loads existing entries", async () => {
    const existing = config.makeExistingEntity();
    config.loadMock.mockResolvedValue([existing]);

    render(config.component);

    expect(await screen.findByText(existing.name)).toBeTruthy();
    expect(screen.getByText(`${existing.items_count} items`)).toBeTruthy();
  });

  it("creates a new entry", async () => {
    const user = userEvent.setup();
    const createdName = "Weekend run";
    config.loadMock.mockResolvedValue([]);
    config.createMock.mockResolvedValue(config.makeCreatedEntity(createdName));

    render(config.component);

    if (config.name === "Templates") {
      await user.click(screen.getByRole("button", { name: "Add template" }));
    }
    if (config.name === "Lists") {
      await user.click(screen.getByRole("button", { name: "Add list" }));
    }

    await user.type(
      await screen.findByPlaceholderText(config.inputPlaceholder),
      createdName
    );
    await user.click(screen.getByRole("button", { name: config.createButtonLabel }));

    await waitFor(() => {
      expect(config.createMock).toHaveBeenCalledWith(
        config.buildCreatePayload(createdName)
      );
    });
    expect(await screen.findByText(createdName)).toBeTruthy();
    expect(screen.getByText("0 items")).toBeTruthy();
  });

  it("deletes an existing entry", async () => {
    const user = userEvent.setup();
    const existing = config.makeExistingEntity();
    config.loadMock.mockResolvedValue([existing]);
    config.deleteMock.mockResolvedValue(null);

    render(config.component);

    await screen.findByText(existing.name);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(config.deleteMock).toHaveBeenCalledWith(existing.id);
    });
    await waitFor(() => {
      expect(screen.queryByText(existing.name)).toBeNull();
    });
  });

  it("shows non-401 load errors", async () => {
    config.loadMock.mockRejectedValue(
      new TestApiError(500, "API request failed", "Backend unavailable")
    );

    render(config.component);

    expect(await screen.findByText("Backend unavailable")).toBeTruthy();
  });

  it("suppresses 401 load errors locally", async () => {
    config.loadMock.mockRejectedValue(
      new TestApiError(401, "API request failed", "Unauthorized")
    );

    render(config.component);

    expect(await screen.findByText(config.emptyStateText)).toBeTruthy();
    expect(screen.queryByText("Unauthorized")).toBeNull();
    expect(screen.queryByText("Load failed.")).toBeNull();
  });
});

describe("Templates route specific behavior", () => {
  beforeEach(() => {
    resetApiMocks();
    pushMock.mockReset();
  });

  it("creates a list directly from a template", async () => {
    const user = userEvent.setup();
    const template = makeTemplate({
      id: "template-1",
      name: "Weekly prep",
    });
    apiMock.listTemplates.mockResolvedValue([template]);
    apiMock.createListFromTemplate.mockResolvedValue(
      makeList({
        id: "list-from-template",
        name: "Weekend run",
      })
    );

    render(Templates);

    await screen.findByText("Weekly prep");
    await user.click(screen.getByRole("button", { name: "Create list from template" }));
    await user.type(await screen.findByPlaceholderText("Optional list name"), "Weekend run");
    await user.click(screen.getByRole("button", { name: "Create list" }));

    await waitFor(() => {
      expect(apiMock.createListFromTemplate).toHaveBeenCalledWith("template-1", {
        name: "Weekend run",
      });
    });
    expect(pushMock).toHaveBeenCalledWith("/lists/list-from-template");
  });
});
