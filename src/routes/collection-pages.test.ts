import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Lists from "./Lists.svelte";
import CompletedLists from "./CompletedLists.svelte";
import Templates from "./Templates.svelte";
import type { ListOut, TemplateOut } from "../lib/types";
import { makeList, makeTemplate, makeTemplateDetail } from "../test/utils/factories";
import { authStore } from "../stores/auth";

const { pushMock, apiMock, TestApiError } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiMock: {
    getMe: vi.fn(),
    listLists: vi.fn(),
    listCompletedLists: vi.fn(),
    createList: vi.fn(),
    completeList: vi.fn(),
    activateList: vi.fn(),
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
  deleteModalTitle: string;
  deleteModalActionLabel: string;
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
    deleteModalTitle: "Delete list?",
    deleteModalActionLabel: "Delete list",
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
    deleteModalTitle: "Delete template?",
    deleteModalActionLabel: "Delete template",
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
    authStore.set({ token: "token", expiry: Date.now() + 10_000, user: null, ready: true });
  });

  it("loads existing entries", async () => {
    const existing = config.makeExistingEntity();
    config.loadMock.mockResolvedValue([existing]);

    render(config.component);

    expect(await screen.findByText(existing.name)).toBeTruthy();
    if (config.name === "Lists") {
      expect(screen.getByText(`(${existing.items_count})`)).toBeTruthy();
    } else {
      expect(screen.getByText(`${existing.items_count} items`)).toBeTruthy();
    }
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
    if (config.name === "Lists") {
      expect(screen.getByText("(0)")).toBeTruthy();
    } else {
      expect(screen.getByText("0 items")).toBeTruthy();
    }
  });

  it("deletes an existing entry", async () => {
    const user = userEvent.setup();
    const existing = config.makeExistingEntity();
    config.loadMock.mockResolvedValue([existing]);
    config.deleteMock.mockResolvedValue(null);

    render(config.component);

    await screen.findByText(existing.name);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: config.deleteModalTitle })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: config.deleteModalActionLabel }));

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
    authStore.set({ token: "token", expiry: Date.now() + 10_000, user: null, ready: true });
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

  it("opens template detail when clicking template card", async () => {
    const user = userEvent.setup();
    const template = makeTemplate({
      id: "template-1",
      name: "Weekly prep",
    });
    apiMock.listTemplates.mockResolvedValue([template]);

    render(Templates);

    await user.click(await screen.findByText("Weekly prep"));
    expect(pushMock).toHaveBeenCalledWith("/templates/template-1");
  });
});

describe("Completed list lifecycle routes", () => {
  beforeEach(() => {
    resetApiMocks();
    pushMock.mockReset();
    authStore.set({ token: "token", expiry: Date.now() + 10_000, user: null, ready: true });
  });

  it("marks an active list complete from Lists page", async () => {
    const user = userEvent.setup();
    const active = makeList({ id: "list-active", name: "Errands", completed: false });
    apiMock.listLists.mockResolvedValue([active]);
    apiMock.completeList.mockResolvedValue({ ...active, completed: true });

    render(Lists);

    await screen.findByText("Errands");
    await user.click(screen.getByRole("button", { name: "Archive list" }));
    await user.click(screen.getByRole("button", { name: "Mark complete" }));

    await waitFor(() => {
      expect(apiMock.completeList).toHaveBeenCalledWith("list-active");
    });
    await waitFor(() => {
      expect(screen.queryByText("Errands")).toBeNull();
    });
  });

  it("shows remaining item count when confirming archive", async () => {
    const user = userEvent.setup();
    const active = makeList({
      id: "list-active",
      name: "Errands",
      completed: false,
      unpurchased_items_count: 3,
    });
    apiMock.listLists.mockResolvedValue([active]);

    render(Lists);

    await screen.findByText("Errands");
    await user.click(screen.getByRole("button", { name: "Archive list" }));

    expect(await screen.findByText("This list still has 3 unpurchased items.")).toBeTruthy();
  });

  it("opens list detail when clicking list card", async () => {
    const user = userEvent.setup();
    const active = makeList({ id: "list-active", name: "Errands", completed: false });
    apiMock.listLists.mockResolvedValue([active]);

    render(Lists);

    await user.click(await screen.findByText("Errands"));
    expect(pushMock).toHaveBeenCalledWith("/lists/list-active");
  });

  it("loads completed lists and marks one active", async () => {
    const user = userEvent.setup();
    const completed = makeList({
      id: "list-completed",
      name: "Finished run",
      completed: true,
    });
    apiMock.listCompletedLists.mockResolvedValue([completed]);
    apiMock.activateList.mockResolvedValue({ ...completed, completed: false });

    render(CompletedLists);

    await screen.findByText("Finished run");
    await user.click(screen.getByRole("button", { name: "Mark active" }));

    await waitFor(() => {
      expect(apiMock.activateList).toHaveBeenCalledWith("list-completed");
    });
    await waitFor(() => {
      expect(screen.queryByText("Finished run")).toBeNull();
    });
  });

  it("shows active users nav item only for admin", async () => {
    const user = userEvent.setup();
    apiMock.listLists.mockResolvedValue([]);
    authStore.set({ token: "token", expiry: Date.now() + 10_000, user: null, ready: true });

    const { unmount } = render(Lists);
    await user.click(await screen.findByRole("button", { name: "Open navigation menu" }));
    expect(screen.queryByText("Users")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pending" })).toBeNull();
    unmount();

    authStore.set({
      token: "token",
      expiry: Date.now() + 10_000,
      user: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        avatar_url: null,
        admin: true,
        created_at: "2026-01-01T00:00:00Z",
        last_login_at: "2026-01-01T00:00:00Z",
      },
      ready: true,
    });

    render(Lists);
    await user.click(await screen.findByRole("button", { name: "Open navigation menu" }));
    expect(await screen.findByText("Users")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Pending" })).toBeTruthy();
  });

  it("shows updated list index actions and routes from header", async () => {
    const user = userEvent.setup();
    apiMock.listLists.mockResolvedValue([]);

    render(Lists);

    const addListButton = await screen.findByRole("button", { name: "Add list" });
    expect(addListButton.className).toContain("floating-add-item");
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Completed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Templates" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard");

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    await user.click(screen.getByRole("button", { name: "Completed" }));
    expect(pushMock).toHaveBeenCalledWith("/lists/completed");

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    await user.click(screen.getByRole("button", { name: "Templates" }));
    expect(pushMock).toHaveBeenCalledWith("/templates");
  });

  it("opens menu and signs out from menu action", async () => {
    const user = userEvent.setup();
    apiMock.listLists.mockResolvedValue([]);

    render(Lists);

    await user.click(await screen.findByRole("button", { name: "Open navigation menu" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(pushMock).toHaveBeenCalledWith("/login");
  });
});
