<script lang="ts">
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import type { ItemOut, ListOut } from "../lib/types";
  import { clearToken } from "../stores/auth";

  export let params: { listId?: string } = {};

  let list: ListOut | null = null;
  let items: ItemOut[] = [];
  let loading = true;
  let error: string | null = null;
  let listName = "";
  let savingName = false;
  let renameModalOpen = false;

  let newItemName = "";
  let newItemQty = "1";
  let creatingItem = false;
  let addItemModalOpen = false;

  let editingItemId: string | null = null;
  let editName = "";
  let editQty = "";
  let savingItem = false;
  let updatingQtyItemId: string | null = null;
  let reorderingItems = false;
  let draggedItemId: string | null = null;
  let dragOverItemId: string | null = null;

  let currentListId = "";

  const parseOptionalNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const stepQuantity = (value: string, delta: number) => {
    const parsed = Number(value.trim());
    const current = Number.isNaN(parsed) ? 0 : parsed;
    const next = Math.max(0, current + delta);
    return Number.isInteger(next) ? next.toString() : `${next}`;
  };

  const sortItems = (nextItems: ItemOut[]) =>
    [...nextItems].sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

  const nextSortOrder = (currentItems: ItemOut[]) =>
    currentItems.reduce((maxSortOrder, item) => {
      return item.sort_order > maxSortOrder ? item.sort_order : maxSortOrder;
    }, 0) + 1;

  const moveItem = (
    currentItems: ItemOut[],
    sourceItemId: string,
    targetItemId: string
  ) => {
    const sourceIndex = currentItems.findIndex((item) => item.id === sourceItemId);
    const targetIndex = currentItems.findIndex((item) => item.id === targetItemId);

    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      sourceIndex === targetIndex
    ) {
      return currentItems;
    }

    const reordered = [...currentItems];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    return reordered;
  };

  const loadList = async (listId: string) => {
    loading = true;
    error = null;
    try {
      const [listData, itemData] = await Promise.all([
        api.getList(listId),
        api.listItems(listId),
      ]);
      list = listData;
      listName = listData.name;
      items = sortItems(itemData);
    } catch (err) {
      const message = getApiErrorMessage(err, "Load failed.");
      if (message) {
        error = message;
      }
    } finally {
      loading = false;
    }
  };

  const updateListName = async () => {
    if (!list || savingName) return;
    const name = listName.trim();
    if (!name) return;
    savingName = true;
    error = null;
    try {
      list = await api.updateList(list.id, { name });
      listName = list.name;
      renameModalOpen = false;
    } catch (err) {
      const message = getApiErrorMessage(err, "Update failed.");
      if (message) {
        error = message;
      }
    } finally {
      savingName = false;
    }
  };

  const createItem = async () => {
    if (!list || creatingItem) return;
    const name = newItemName.trim();
    if (!name) return;
    creatingItem = true;
    error = null;
    try {
      const payload = {
        name,
        qty: parseOptionalNumber(newItemQty),
        sort_order: nextSortOrder(items),
      };
      const created = await api.createItem(list.id, payload);
      items = sortItems([...items, created]);
      newItemName = "";
      newItemQty = "1";
      addItemModalOpen = false;
    } catch (err) {
      const message = getApiErrorMessage(err, "Create failed.");
      if (message) {
        error = message;
      }
    } finally {
      creatingItem = false;
    }
  };

  const openAddItemModal = () => {
    newItemName = "";
    newItemQty = "1";
    addItemModalOpen = true;
  };

  const openRenameModal = () => {
    if (!list) return;
    listName = list.name;
    renameModalOpen = true;
  };

  const closeRenameModal = () => {
    if (savingName) return;
    renameModalOpen = false;
  };

  const closeAddItemModal = () => {
    if (creatingItem) return;
    addItemModalOpen = false;
  };

  const incrementNewItemQty = () => {
    newItemQty = stepQuantity(newItemQty, 1);
  };

  const decrementNewItemQty = () => {
    newItemQty = stepQuantity(newItemQty, -1);
  };

  const incrementEditQty = () => {
    editQty = stepQuantity(editQty, 1);
  };

  const decrementEditQty = () => {
    editQty = stepQuantity(editQty, -1);
  };

  const clearDragState = () => {
    draggedItemId = null;
    dragOverItemId = null;
  };

  const handleDragStart = (event: DragEvent, itemId: string) => {
    if (editingItemId || reorderingItems) {
      event.preventDefault();
      return;
    }

    draggedItemId = itemId;
    event.dataTransfer?.setData("text/plain", itemId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (event: DragEvent, targetItemId: string) => {
    if (!draggedItemId || draggedItemId === targetItemId || reorderingItems) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    dragOverItemId = targetItemId;
  };

  const handleDrop = async (event: DragEvent, targetItemId: string) => {
    event.preventDefault();
    if (!list || reorderingItems) {
      clearDragState();
      return;
    }

    const sourceItemId =
      draggedItemId || event.dataTransfer?.getData("text/plain") || null;
    if (!sourceItemId || sourceItemId === targetItemId) {
      clearDragState();
      return;
    }

    const previousItems = items;
    const reordered = moveItem(previousItems, sourceItemId, targetItemId);
    if (reordered === previousItems) {
      clearDragState();
      return;
    }

    items = reordered;
    reorderingItems = true;
    error = null;
    clearDragState();

    try {
      const updated = await api.reorderListItems(
        list.id,
        reordered.map((item) => item.id)
      );
      items = sortItems(updated);
    } catch (err) {
      items = previousItems;
      const message = getApiErrorMessage(err, "Reorder failed.");
      if (message) {
        error = message;
      }
    } finally {
      reorderingItems = false;
    }
  };

  const toggleItem = async (itemId: string) => {
    error = null;
    try {
      const updated = await api.toggleItem(itemId);
      items = sortItems(
        items.map((item) => (item.id === itemId ? updated : item))
      );
    } catch (err) {
      const message = getApiErrorMessage(err, "Toggle failed.");
      if (message) {
        error = message;
      }
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!window.confirm("Delete this item?")) return;
    error = null;
    try {
      await api.deleteItem(itemId);
      items = items.filter((item) => item.id !== itemId);
    } catch (err) {
      const message = getApiErrorMessage(err, "Delete failed.");
      if (message) {
        error = message;
      }
    }
  };

  const adjustItemQty = async (item: ItemOut, delta: number) => {
    if (updatingQtyItemId || editingItemId === item.id) return;

    const currentQty = item.qty ?? 0;
    const nextQty = Math.max(0, currentQty + delta);
    if (nextQty === currentQty) return;

    updatingQtyItemId = item.id;
    error = null;
    try {
      const updated = await api.updateItem(item.id, {
        name: item.name,
        qty: nextQty,
      });
      items = sortItems(
        items.map((entry) => (entry.id === item.id ? updated : entry))
      );
    } catch (err) {
      const message = getApiErrorMessage(err, "Update failed.");
      if (message) {
        error = message;
      }
    } finally {
      updatingQtyItemId = null;
    }
  };

  const startEditItem = (item: ItemOut) => {
    editingItemId = item.id;
    editName = item.name;
    editQty = item.qty?.toString() ?? "";
  };

  const cancelEditItem = () => {
    editingItemId = null;
  };

  const saveItem = async (itemId: string) => {
    if (savingItem) return;
    const name = editName.trim();
    if (!name) return;
    savingItem = true;
    error = null;
    try {
      const payload = {
        name,
        qty: parseOptionalNumber(editQty),
      };
      const updated = await api.updateItem(itemId, payload);
      items = sortItems(
        items.map((item) => (item.id === itemId ? updated : item))
      );
      editingItemId = null;
    } catch (err) {
      const message = getApiErrorMessage(err, "Update failed.");
      if (message) {
        error = message;
      }
    } finally {
      savingItem = false;
    }
  };

  const logout = () => {
    clearToken();
    push("/login");
  };

  $: if (params.listId && params.listId !== currentListId) {
    currentListId = params.listId;
    loadList(currentListId);
  }
</script>

<main>
  <header class="page-header">
    <div>
      <div class="title-with-action">
        <h1>{list ? list.name : "List"}</h1>
        <button
          class="button ghost icon-button"
          type="button"
          aria-label="Edit list name"
          title="Edit name"
          on:click={openRenameModal}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.79 1.79 3.75 3.75 1.96-1.62z"
            />
          </svg>
        </button>
      </div>
      <p>Manage items and keep things in sync.</p>
    </div>
    <div class="nav-links">
      <button class="button ghost" on:click={() => push("/dashboard")}>
        Dashboard
      </button>
      <button class="button ghost" on:click={() => push("/lists")}>Lists</button>
      <button class="button ghost" on:click={() => push("/templates")}>
        Templates
      </button>
      <button class="button secondary" on:click={logout}>Sign out</button>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading list...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if !list}
    <p class="meta">List not found.</p>
  {:else}
    <section class="card stack">
      <div class="row">
        <div>
          <h2>Items</h2>
          <p class="meta">Add, edit, or tick items as you shop.</p>
        </div>
      </div>

      {#if items.length === 0}
        <p class="meta">No items yet.</p>
      {:else}
        <div class="stack">
          {#each items as item}
            <div
              class="card draggable-item"
              class:drag-over={dragOverItemId === item.id}
              draggable={editingItemId !== item.id && !reorderingItems}
              role="listitem"
              aria-grabbed={draggedItemId === item.id}
              on:dragstart={(event) => handleDragStart(event, item.id)}
              on:dragover={(event) => handleDragOver(event, item.id)}
              on:drop={(event) => handleDrop(event, item.id)}
              on:dragend={clearDragState}
            >
              {#if editingItemId === item.id}
                <div class="inline-form">
                  <input class="input" bind:value={editName} />
                  <div class="qty-stepper">
                    <button
                      class="button ghost icon-button stepper-button"
                      type="button"
                      aria-label="Decrease quantity"
                      on:click={decrementEditQty}
                    >
                      -
                    </button>
                    <input
                      class="input qty-input"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Qty"
                      bind:value={editQty}
                    />
                    <button
                      class="button ghost icon-button stepper-button"
                      type="button"
                      aria-label="Increase quantity"
                      on:click={incrementEditQty}
                    >
                      +
                    </button>
                  </div>
                  <div class="toolbar">
                    <button
                      class="button"
                      disabled={savingItem}
                      on:click={() => saveItem(item.id)}
                    >
                      {savingItem ? "Saving..." : "Save"}
                    </button>
                    <button class="button ghost" on:click={cancelEditItem}>
                      Cancel
                    </button>
                  </div>
                </div>
              {:else}
                <div class="item-row">
                  <div class="item-main">
                    <input
                      class="item-checkbox"
                      type="checkbox"
                      checked={item.purchased}
                      aria-label={`Purchased ${item.name}`}
                      on:change={() => toggleItem(item.id)}
                    />
                    <div>
                      {#if item.purchased}
                        <div class="item-summary-checked">
                          <span>{item.name}</span>
                          {#if item.qty !== null && item.qty !== undefined}
                            <span>(x {item.qty})</span>
                          {/if}
                        </div>
                      {:else}
                        <h3>{item.name}</h3>
                        <div class="meta">
                          {#if item.qty !== null && item.qty !== undefined}
                            (x {item.qty})
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                  <div class="toolbar">
                    <button
                      class="button ghost icon-button qty-inline-button"
                      type="button"
                      aria-label={`Increase quantity for ${item.name}`}
                      disabled={updatingQtyItemId === item.id}
                      on:click={() => adjustItemQty(item, 1)}
                    >
                      +
                    </button>
                    <button
                      class="button ghost icon-button qty-inline-button"
                      type="button"
                      aria-label={`Decrease quantity for ${item.name}`}
                      disabled={updatingQtyItemId === item.id}
                      on:click={() => adjustItemQty(item, -1)}
                    >
                      -
                    </button>
                    <button
                      class="button ghost icon-button"
                      aria-label="Edit"
                      title="Edit"
                      on:click={() => startEditItem(item)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.79 1.79 3.75 3.75 1.96-1.62z"
                        />
                      </svg>
                    </button>
                    <button
                      class="button danger icon-button"
                      aria-label="Delete"
                      title="Delete"
                      on:click={() => deleteItem(item.id)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9zM6 21h12l1-14H5l1 14z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <button class="button floating-add-item" on:click={openAddItemModal}>
      Add item
    </button>
  {/if}
</main>

{#if addItemModalOpen}
  <div class="modal-backdrop" role="presentation" on:click|self={closeAddItemModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-list-item-title"
    >
      <h3 id="add-list-item-title">Add item</h3>
      <div class="inline-form">
        <input class="input" placeholder="Item name" bind:value={newItemName} />
        <div class="qty-stepper">
          <button
            class="button ghost icon-button stepper-button"
            type="button"
            aria-label="Decrease quantity"
            on:click={decrementNewItemQty}
          >
            -
          </button>
          <input
            class="input qty-input"
            type="number"
            min="0"
            step="1"
            placeholder="Qty"
            bind:value={newItemQty}
          />
          <button
            class="button ghost icon-button stepper-button"
            type="button"
            aria-label="Increase quantity"
            on:click={incrementNewItemQty}
          >
            +
          </button>
        </div>
      </div>
      <div class="toolbar">
        <button class="button ghost" disabled={creatingItem} on:click={closeAddItemModal}>
          Cancel
        </button>
        <button class="button" disabled={creatingItem} on:click={createItem}>
          {creatingItem ? "Creating..." : "Create item"}
        </button>
      </div>
    </section>
  </div>
{/if}

{#if renameModalOpen}
  <div class="modal-backdrop" role="presentation" on:click|self={closeRenameModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-list-title"
    >
      <h3 id="rename-list-title">Change list name</h3>
      <input class="input" placeholder="List name" bind:value={listName} />
      <div class="toolbar">
        <button class="button ghost" disabled={savingName} on:click={closeRenameModal}>
          Cancel
        </button>
        <button class="button" disabled={savingName} on:click={updateListName}>
          {savingName ? "Saving..." : "Save name"}
        </button>
      </div>
    </section>
  </div>
{/if}
