import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ListDetail from "./ListDetail.svelte";
import TemplateDetail from "./TemplateDetail.svelte";
import {
  makeItem,
  makeList,
  makeTemplate,
  makeTemplateDetail,
  makeTemplateItem,
} from "../test/utils/factories";

const { pushMock, apiMock, TestApiError } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiMock: {
    getMe: vi.fn(),
    getList: vi.fn(),
    listItems: vi.fn(),
    updateList: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    toggleItem: vi.fn(),
    deleteItem: vi.fn(),
    reorderListItems: vi.fn(),
    getTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    createTemplateItem: vi.fn(),
    updateTemplateItem: vi.fn(),
    deleteTemplateItem: vi.fn(),
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

type DetailConfig = {
  name: string;
  component: any;
  props: { params: { listId?: string; templateId?: string } };
  itemNameForEdit: string;
  sortedItemNames: string[];
  notFoundText: string;
  seedLoadSuccess: () => void;
  seedLoadError: (error: unknown) => void;
  seedRenameSuccess: (name: string) => void;
  assertRenameCalled: (name: string) => void;
  seedCreateItemSuccess: (name: string) => void;
  assertCreateCalled: (name: string) => void;
  seedEditItemSuccess: (name: string) => void;
  assertEditCalled: (name: string) => void;
  seedDeleteSuccess: () => void;
  assertDeleteCalled: () => void;
};

const listId = "list-1";
const listPrimaryItemId = "list-item-1";
const listBase = makeList({
  id: listId,
  name: "Family groceries",
});
const listItemsUnsorted = [
  makeItem({
    id: "list-item-2",
    list_id: listId,
    name: "Bananas",
    sort_order: 2,
    created_at: "2026-01-01T00:00:02Z",
  }),
  makeItem({
    id: listPrimaryItemId,
    list_id: listId,
    name: "Apples",
    sort_order: 1,
    created_at: "2026-01-01T00:00:01Z",
  }),
];

const templateId = "template-1";
const templatePrimaryItemId = "template-item-1";
const templateBase = makeTemplate({
  id: templateId,
  name: "Bulk prep",
});
const templateItemsUnsorted = [
  makeTemplateItem({
    id: "template-item-2",
    template_id: templateId,
    name: "Rice",
    sort_order: 2,
    created_at: "2026-01-01T00:00:02Z",
  }),
  makeTemplateItem({
    id: templatePrimaryItemId,
    template_id: templateId,
    name: "Pasta",
    sort_order: 1,
    created_at: "2026-01-01T00:00:01Z",
  }),
];

const detailConfigs: DetailConfig[] = [
  {
    name: "ListDetail",
    component: ListDetail,
    props: { params: { listId } },
    itemNameForEdit: "Apples",
    sortedItemNames: ["Apples", "Bananas"],
    notFoundText: "List not found.",
    seedLoadSuccess: () => {
      apiMock.getList.mockResolvedValue(listBase);
      apiMock.listItems.mockResolvedValue(listItemsUnsorted);
    },
    seedLoadError: (error) => {
      apiMock.getList.mockRejectedValue(error);
      apiMock.listItems.mockResolvedValue([]);
    },
    seedRenameSuccess: (name) => {
      apiMock.updateList.mockResolvedValue(
        makeList({
          ...listBase,
          name,
        })
      );
    },
    assertRenameCalled: (name) => {
      expect(apiMock.updateList).toHaveBeenCalledWith(listId, { name });
    },
    seedCreateItemSuccess: (name) => {
      apiMock.createItem.mockResolvedValue(
        makeItem({
          id: "list-item-created",
          list_id: listId,
          name,
          sort_order: 0,
        })
      );
    },
    assertCreateCalled: (name) => {
      expect(apiMock.createItem).toHaveBeenCalledWith(listId, {
        name,
        qty: 1,
        sort_order: 3,
      });
    },
    seedEditItemSuccess: (name) => {
      apiMock.updateItem.mockResolvedValue(
        makeItem({
          id: listPrimaryItemId,
          list_id: listId,
          name,
          sort_order: 1,
        })
      );
    },
    assertEditCalled: (name) => {
      expect(apiMock.updateItem).toHaveBeenCalledWith(listPrimaryItemId, {
        name,
        qty: null,
      });
    },
    seedDeleteSuccess: () => {
      apiMock.deleteItem.mockResolvedValue(null);
    },
    assertDeleteCalled: () => {
      expect(apiMock.deleteItem).toHaveBeenCalledWith(listPrimaryItemId);
    },
  },
  {
    name: "TemplateDetail",
    component: TemplateDetail,
    props: { params: { templateId } },
    itemNameForEdit: "Pasta",
    sortedItemNames: ["Pasta", "Rice"],
    notFoundText: "Template not found.",
    seedLoadSuccess: () => {
      apiMock.getTemplate.mockResolvedValue(
        makeTemplateDetail({
          ...templateBase,
          items: templateItemsUnsorted,
        })
      );
    },
    seedLoadError: (error) => {
      apiMock.getTemplate.mockRejectedValue(error);
    },
    seedRenameSuccess: (name) => {
      apiMock.updateTemplate.mockResolvedValue(
        makeTemplate({
          ...templateBase,
          name,
        })
      );
    },
    assertRenameCalled: (name) => {
      expect(apiMock.updateTemplate).toHaveBeenCalledWith(templateId, { name });
    },
    seedCreateItemSuccess: (name) => {
      apiMock.createTemplateItem.mockResolvedValue(
        makeTemplateItem({
          id: "template-item-created",
          template_id: templateId,
          name,
          sort_order: 0,
        })
      );
    },
    assertCreateCalled: (name) => {
      expect(apiMock.createTemplateItem).toHaveBeenCalledWith(templateId, {
        name,
        qty: 1,
        sort_order: 3,
      });
    },
    seedEditItemSuccess: (name) => {
      apiMock.updateTemplateItem.mockResolvedValue(
        makeTemplateItem({
          id: templatePrimaryItemId,
          template_id: templateId,
          name,
          sort_order: 1,
        })
      );
    },
    assertEditCalled: (name) => {
      expect(apiMock.updateTemplateItem).toHaveBeenCalledWith(
        templateId,
        templatePrimaryItemId,
        {
          name,
          qty: null,
        }
      );
    },
    seedDeleteSuccess: () => {
      apiMock.deleteTemplateItem.mockResolvedValue(null);
    },
    assertDeleteCalled: () => {
      expect(apiMock.deleteTemplateItem).toHaveBeenCalledWith(
        templateId,
        templatePrimaryItemId
      );
    },
  },
];

const resetApiMocks = () => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
};

describe.each(detailConfigs)("$name route", (config) => {
  beforeEach(() => {
    resetApiMocks();
    pushMock.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("loads detail data and sorts items by sort order", async () => {
    config.seedLoadSuccess();

    render(config.component, { props: config.props });

    const itemHeadings = await screen.findAllByRole("heading", { level: 3 });
    const names = itemHeadings.map((heading) => heading.textContent?.trim());
    expect(names).toEqual(config.sortedItemNames);
  });

  it("renames the parent entity", async () => {
    const user = userEvent.setup();
    const renamed = "Renamed entry";
    config.seedLoadSuccess();
    config.seedRenameSuccess(renamed);

    render(config.component, { props: config.props });

    await screen.findByText(config.itemNameForEdit);
    await user.click(
      screen.getByRole("button", {
        name:
          config.name === "ListDetail" ? "Edit list name" : "Edit template name",
      })
    );
    const nameInput = await screen.findByDisplayValue(
      config.name === "ListDetail" ? listBase.name : templateBase.name
    );
    await user.clear(nameInput);
    await user.type(nameInput, renamed);
    await user.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() => {
      config.assertRenameCalled(renamed);
    });
    expect(await screen.findByRole("heading", { level: 1, name: renamed })).toBeTruthy();
  });

  it("creates a new item", async () => {
    const user = userEvent.setup();
    const newItemName = "New item";
    config.seedLoadSuccess();
    config.seedCreateItemSuccess(newItemName);

    render(config.component, { props: config.props });

    await user.click(await screen.findByRole("button", { name: "Add item" }));
    await user.type(await screen.findByPlaceholderText("Item name"), newItemName);
    await user.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() => {
      config.assertCreateCalled(newItemName);
    });
    expect(await screen.findByText(newItemName)).toBeTruthy();
  });

  it("edits an existing item", async () => {
    const user = userEvent.setup();
    const editedName = "Edited item";
    config.seedLoadSuccess();
    config.seedEditItemSuccess(editedName);

    render(config.component, { props: config.props });

    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
    const editInput = await screen.findByDisplayValue(config.itemNameForEdit);
    await user.clear(editInput);
    await user.type(editInput, editedName);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      config.assertEditCalled(editedName);
    });
    expect(await screen.findByText(editedName)).toBeTruthy();
  });

  it("deletes an existing item", async () => {
    const user = userEvent.setup();
    config.seedLoadSuccess();
    config.seedDeleteSuccess();

    render(config.component, { props: config.props });

    await user.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);

    await waitFor(() => {
      config.assertDeleteCalled();
    });
    await waitFor(() => {
      expect(screen.queryByText(config.itemNameForEdit)).toBeNull();
    });
  });

  it("shows non-401 load errors", async () => {
    config.seedLoadError(
      new TestApiError(500, "API request failed", "Permission denied")
    );

    render(config.component, { props: config.props });

    expect(await screen.findByText("Permission denied")).toBeTruthy();
  });

  it("suppresses 401 load errors locally", async () => {
    config.seedLoadError(new TestApiError(401, "API request failed", "Unauthorized"));

    render(config.component, { props: config.props });

    expect(await screen.findByText(config.notFoundText)).toBeTruthy();
    expect(screen.queryByText("Unauthorized")).toBeNull();
    expect(screen.queryByText("Load failed.")).toBeNull();
  });
});

describe("ListDetail route specific behavior", () => {
  beforeEach(() => {
    resetApiMocks();
    pushMock.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("toggles purchased state", async () => {
    const user = userEvent.setup();
    apiMock.getList.mockResolvedValue(listBase);
    apiMock.listItems.mockResolvedValue(listItemsUnsorted);
    apiMock.toggleItem.mockResolvedValue(
      makeItem({
        id: listPrimaryItemId,
        list_id: listId,
        name: "Apples",
        purchased: true,
        sort_order: 1,
      })
    );

    render(ListDetail, { props: { params: { listId } } });

    const checkbox = (await screen.findAllByRole("checkbox", {
      name: "Purchased Apples",
    }))[0] as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    await user.click(checkbox);

    await waitFor(() => {
      expect(apiMock.toggleItem).toHaveBeenCalledWith(listPrimaryItemId);
    });
    await waitFor(() => {
      const toggled = screen
        .getAllByRole("checkbox", {
          name: "Purchased Apples",
        })
        .map((node) => node as HTMLInputElement);
      expect(toggled.some((node) => node.checked)).toBe(true);
    });
  });

  it("renders purchased items in dedicated section", async () => {
    apiMock.getList.mockResolvedValue(listBase);
    apiMock.listItems.mockResolvedValue([
      ...listItemsUnsorted,
      makeItem({
        id: "list-item-purchased",
        list_id: listId,
        name: "Bread",
        purchased: true,
        sort_order: 3,
      }),
    ]);

    render(ListDetail, { props: { params: { listId } } });

    expect(await screen.findByRole("heading", { name: "Purchased items" })).toBeTruthy();
    expect((await screen.findAllByText("Bread")).length).toBeGreaterThan(0);
  });

  it("moves an item to purchased section when checked", async () => {
    const user = userEvent.setup();
    apiMock.getList.mockResolvedValue(listBase);
    apiMock.listItems.mockResolvedValue(listItemsUnsorted);
    apiMock.toggleItem.mockResolvedValue(
      makeItem({
        id: listPrimaryItemId,
        list_id: listId,
        name: "Apples",
        purchased: true,
        sort_order: 1,
      })
    );

    render(ListDetail, { props: { params: { listId } } });

    await user.click(
      (await screen.findAllByRole("checkbox", {
        name: "Purchased Apples",
      }))[0]
    );

    expect(await screen.findByRole("heading", { name: "Purchased items" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "Apples" })).toBeNull();
    expect(await screen.findByText("Apples")).toBeTruthy();
  });

  it("moves an item back to main list when unchecked in purchased section", async () => {
    const user = userEvent.setup();
    apiMock.getList.mockResolvedValue(listBase);
    apiMock.listItems.mockResolvedValue([
      makeItem({
        id: listPrimaryItemId,
        list_id: listId,
        name: "Apples",
        purchased: true,
        sort_order: 1,
      }),
      makeItem({
        id: "list-item-2",
        list_id: listId,
        name: "Bananas",
        purchased: false,
        sort_order: 2,
      }),
    ]);
    apiMock.toggleItem.mockResolvedValue(
      makeItem({
        id: listPrimaryItemId,
        list_id: listId,
        name: "Apples",
        purchased: false,
        sort_order: 1,
      })
    );

    render(ListDetail, { props: { params: { listId } } });

    await user.click(
      (await screen.findAllByRole("checkbox", {
        name: "Purchased Apples",
      }))[0]
    );

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Purchased items" })).toBeNull();
    });
    expect(await screen.findByRole("heading", { level: 3, name: "Apples" })).toBeTruthy();
  });

  it("loads purchased items into purchased section and hides them in main list", async () => {
    apiMock.getList.mockResolvedValue(listBase);
    apiMock.listItems.mockResolvedValue([
      makeItem({
        id: listPrimaryItemId,
        list_id: listId,
        name: "Apples",
        purchased: true,
        sort_order: 1,
      }),
      makeItem({
        id: "list-item-2",
        list_id: listId,
        name: "Bananas",
        purchased: false,
        sort_order: 2,
      }),
    ]);

    render(ListDetail, { props: { params: { listId } } });

    expect(await screen.findByRole("heading", { name: "Purchased items" })).toBeTruthy();
    expect(await screen.findByText("Apples")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "Apples" })).toBeNull();
    expect(await screen.findByRole("heading", { level: 3, name: "Bananas" })).toBeTruthy();
  });

  it("reorders items and persists the new order", async () => {
    apiMock.getList.mockResolvedValue(listBase);
    apiMock.listItems.mockResolvedValue([
      ...listItemsUnsorted,
      makeItem({
        id: "list-item-purchased",
        list_id: listId,
        name: "Bread",
        purchased: true,
        sort_order: 3,
      }),
    ]);
    apiMock.reorderListItems.mockResolvedValue([
      makeItem({
        id: "list-item-2",
        list_id: listId,
        name: "Bananas",
        sort_order: 0,
      }),
      makeItem({
        id: listPrimaryItemId,
        list_id: listId,
        name: "Apples",
        sort_order: 1,
      }),
      makeItem({
        id: "list-item-purchased",
        list_id: listId,
        name: "Bread",
        purchased: true,
        sort_order: 2,
      }),
    ]);

    render(ListDetail, { props: { params: { listId } } });

    await screen.findByText("Apples");
    const applesCard = screen
      .getByRole("heading", { level: 3, name: "Apples" })
      .closest(".draggable-item");
    const bananasCard = screen
      .getByRole("heading", { level: 3, name: "Bananas" })
      .closest(".draggable-item");
    expect(screen.queryByRole("heading", { level: 3, name: "Bread" })).toBeNull();

    expect(applesCard).toBeTruthy();
    expect(bananasCard).toBeTruthy();

    fireEvent.dragStart(applesCard as Element);
    fireEvent.dragOver(bananasCard as Element);
    fireEvent.drop(bananasCard as Element);
    fireEvent.dragEnd(applesCard as Element);

    await waitFor(() => {
      expect(apiMock.reorderListItems).toHaveBeenCalledWith(listId, [
        "list-item-2",
        "list-item-1",
        "list-item-purchased",
      ]);
    });
  });

  it("disables list row decrease button when quantity is one", async () => {
    apiMock.getList.mockResolvedValue(listBase);
    apiMock.listItems.mockResolvedValue([
      makeItem({
        id: listPrimaryItemId,
        list_id: listId,
        name: "Apples",
        qty: 1,
        purchased: false,
        sort_order: 1,
      }),
    ]);

    render(ListDetail, { props: { params: { listId } } });

    const decrease = await screen.findByRole("button", {
      name: "Decrease quantity for Apples",
    });
    expect(decrease.hasAttribute("disabled")).toBe(true);
  });
});

describe("TemplateDetail route specific behavior", () => {
  beforeEach(() => {
    resetApiMocks();
    pushMock.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("creates a list from template and navigates to the new list", async () => {
    const user = userEvent.setup();
    apiMock.getTemplate.mockResolvedValue(
      makeTemplateDetail({
        ...templateBase,
        items: templateItemsUnsorted,
      })
    );
    apiMock.createListFromTemplate.mockResolvedValue(
      makeList({
        id: "list-from-template",
        name: "Weekend prep",
      })
    );

    render(TemplateDetail, { props: { params: { templateId } } });

    await user.type(await screen.findByPlaceholderText("Optional list name"), "Weekend prep");
    await user.click(screen.getByRole("button", { name: "Create list" }));

    await waitFor(() => {
      expect(apiMock.createListFromTemplate).toHaveBeenCalledWith(templateId, {
        name: "Weekend prep",
      });
    });
    expect(pushMock).toHaveBeenCalledWith("/lists/list-from-template");
  });

  it("adjusts template item quantity from item row controls", async () => {
    const user = userEvent.setup();
    apiMock.getTemplate.mockResolvedValue(
      makeTemplateDetail({
        ...templateBase,
        items: templateItemsUnsorted,
      })
    );
    apiMock.updateTemplateItem.mockResolvedValue(
      makeTemplateItem({
        id: templatePrimaryItemId,
        template_id: templateId,
        name: "Pasta",
        qty: 1,
        sort_order: 1,
      })
    );

    render(TemplateDetail, { props: { params: { templateId } } });

    await user.click(
      await screen.findByRole("button", {
        name: "Increase quantity for Pasta",
      })
    );

    await waitFor(() => {
      expect(apiMock.updateTemplateItem).toHaveBeenCalledWith(
        templateId,
        templatePrimaryItemId,
        {
          name: "Pasta",
          qty: 1,
        }
      );
    });
  });

  it("disables template row decrease button when quantity is one", async () => {
    apiMock.getTemplate.mockResolvedValue(
      makeTemplateDetail({
        ...templateBase,
        items: [
          makeTemplateItem({
            id: templatePrimaryItemId,
            template_id: templateId,
            name: "Pasta",
            qty: 1,
            sort_order: 1,
          }),
        ],
      })
    );

    render(TemplateDetail, { props: { params: { templateId } } });

    const decrease = await screen.findByRole("button", {
      name: "Decrease quantity for Pasta",
    });
    expect(decrease.hasAttribute("disabled")).toBe(true);
  });
});
