<script lang="ts">
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import NavMenu from "../lib/NavMenu.svelte";
  import type { TemplateDetailOut, TemplateItemOut } from "../lib/types";
  import { authStore } from "../stores/auth";

  export let params: { templateId?: string } = {};

  let template: TemplateDetailOut | null = null;
  let items: TemplateItemOut[] = [];
  let loading = true;
  let error: string | null = null;
  let templateName = "";
  let savingName = false;
  let renameModalOpen = false;

  let newItemName = "";
  let newItemQty = "1";
  let creatingItem = false;
  let addItemModalOpen = false;
  // When set, the add-item modal is in "insert" mode: the new item is
  // positioned relative to this item id (via create + reorder) instead of
  // appended at the end. Null = append (the floating "Add item" flow).
  // `insertSide` chooses above vs below the target.
  let insertTargetId: string | null = null;
  let insertSide: "above" | "below" = "above";

  let editingItemId: string | null = null;
  let editName = "";
  let editQty = "";
  let savingItem = false;
  let updatingQtyItemId: string | null = null;

  let createListName = "";
  let creatingList = false;
  let createListModalOpen = false;

  let reorderingItems = false;
  let draggedItemId: string | null = null;
  let dragOverItemId: string | null = null;

  let currentTemplateId = "";

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

  const sortItems = (nextItems: TemplateItemOut[]) =>
    [...nextItems].sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

  const nextSortOrder = (currentItems: TemplateItemOut[]) =>
    currentItems.reduce((maxSortOrder, item) => {
      return item.sort_order > maxSortOrder ? item.sort_order : maxSortOrder;
    }, 0) + 1;

  const moveTemplateItem = (
    currentItems: TemplateItemOut[],
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

  const applyReorder = async (reordered: TemplateItemOut[], previousItems: TemplateItemOut[]) => {
    if (!template) return;
    items = reordered;
    reorderingItems = true;
    error = null;
    try {
      const updated = await api.reorderTemplateItems(
        template.id,
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

  const clearDragState = () => {
    draggedItemId = null;
    dragOverItemId = null;
  };

  const handleDragStart = (event: DragEvent, itemId: string) => {
    if (editingItemId || savingItem || reorderingItems) {
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
    if (!template || reorderingItems) {
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
    const reordered = moveTemplateItem(previousItems, sourceItemId, targetItemId);
    clearDragState();
    if (reordered === previousItems) return;
    await applyReorder(reordered, previousItems);
  };

  const moveItemUp = async (itemId: string) => {
    if (editingItemId || savingItem || reorderingItems) return;
    const index = items.findIndex((item) => item.id === itemId);
    if (index <= 0) return;
    const previousItems = items;
    const reordered = moveTemplateItem(previousItems, itemId, items[index - 1].id);
    if (reordered === previousItems) return;
    await applyReorder(reordered, previousItems);
  };

  const moveItemDown = async (itemId: string) => {
    if (editingItemId || savingItem || reorderingItems) return;
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0 || index >= items.length - 1) return;
    const previousItems = items;
    const reordered = moveTemplateItem(previousItems, itemId, items[index + 1].id);
    if (reordered === previousItems) return;
    await applyReorder(reordered, previousItems);
  };

  const loadTemplate = async (templateId: string) => {
    loading = true;
    error = null;
    try {
      const data = await api.getTemplate(templateId);
      template = data;
      items = sortItems(data.items);
      templateName = data.name;
    } catch (err) {
      const message = getApiErrorMessage(err, "Load failed.");
      if (message) {
        error = message;
      }
    } finally {
      loading = false;
    }
  };

  const updateTemplateName = async () => {
    if (!template || savingName) return;
    const name = templateName.trim();
    if (!name) return;
    savingName = true;
    error = null;
    try {
      const updated = await api.updateTemplate(template.id, { name });
      template = { ...template, ...updated };
      templateName = updated.name;
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

  const createTemplateItem = async () => {
    if (!template || creatingItem) return;
    const name = newItemName.trim();
    if (!name) return;
    creatingItem = true;
    error = null;
    const targetId = insertTargetId;
    const side = insertSide;
    const previousItems = items;
    let created: TemplateItemOut | null = null;
    try {
      created = await api.createTemplateItem(template.id, {
        name,
        qty: parseOptionalNumber(newItemQty),
        sort_order: nextSortOrder(previousItems),
      });
      if (targetId) {
        // Insert relative to target: integer sort_orders are contiguous, so
        // there is no gap to bisect. Re-emit the full id list with the new item
        // spliced at the target's index (above) or just after it (below), and
        // let the BE renumber 0..N atomically. A "below" on the last item lands
        // at the end (append-equivalent).
        const targetIndex = previousItems.findIndex(
          (item) => item.id === targetId
        );
        const insertAt =
          targetIndex < 0
            ? previousItems.length
            : targetIndex + (side === "below" ? 1 : 0);
        const reordered = [...previousItems];
        reordered.splice(insertAt, 0, created);
        const updated = await api.reorderTemplateItems(
          template.id,
          reordered.map((item) => item.id)
        );
        items = sortItems(updated);
      } else {
        items = sortItems([...previousItems, created]);
      }
      newItemName = "";
      newItemQty = "1";
      insertTargetId = null;
      addItemModalOpen = false;
    } catch (err) {
      if (created) {
        // Create succeeded but the reposition (reorder) failed — a partial
        // success: the item exists at the bottom of the template on the
        // server. Surface it via the app-wide full-screen `error` pattern
        // (matching every other mutation failure for v1; a non-blocking inline
        // notice is deferred to a separate cross-cutting ticket). The copy is
        // purely informational — it names where the item landed and does not
        // instruct a drag the user can't perform while the list is hidden.
        // Local state still appends the item so the list is correct once the
        // error clears.
        items = sortItems([...previousItems, created]);
        // Neutral / direction-agnostic on purpose: the same failure path fires
        // for both above and below inserts, so the copy must not name a side.
        error =
          "Item added, but it couldn't be placed where you wanted. It's at the bottom of your list.";
        newItemName = "";
        newItemQty = "1";
        insertTargetId = null;
        addItemModalOpen = false;
      } else {
        const message = getApiErrorMessage(err, "Create failed.");
        if (message) {
          error = message;
        }
      }
    } finally {
      creatingItem = false;
    }
  };

  const openAddItemModal = () => {
    newItemName = "";
    newItemQty = "1";
    insertTargetId = null;
    addItemModalOpen = true;
  };

  const openInsertModal = (itemId: string, side: "above" | "below") => {
    newItemName = "";
    newItemQty = "1";
    insertTargetId = itemId;
    insertSide = side;
    addItemModalOpen = true;
  };

  const closeAddItemModal = () => {
    if (creatingItem) return;
    insertTargetId = null;
    addItemModalOpen = false;
  };

  const openRenameModal = () => {
    if (!template) return;
    templateName = template.name;
    renameModalOpen = true;
  };

  const closeRenameModal = () => {
    if (savingName) return;
    renameModalOpen = false;
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

  const deleteTemplateItem = async (itemId: string) => {
    if (!template) return;
    if (!window.confirm("Delete this template item?")) return;
    error = null;
    try {
      await api.deleteTemplateItem(template.id, itemId);
      items = items.filter((item) => item.id !== itemId);
    } catch (err) {
      const message = getApiErrorMessage(err, "Delete failed.");
      if (message) {
        error = message;
      }
    }
  };

  const adjustTemplateItemQty = async (item: TemplateItemOut, delta: number) => {
    if (!template || editingItemId === item.id || updatingQtyItemId) return;

    const currentQty = item.qty ?? 0;
    const nextQty = Math.max(0, currentQty + delta);
    if (nextQty === currentQty) return;

    updatingQtyItemId = item.id;
    error = null;
    try {
      const updated = await api.updateTemplateItem(template.id, item.id, {
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

  const startEditItem = (item: TemplateItemOut) => {
    editingItemId = item.id;
    editName = item.name;
    editQty = item.qty?.toString() ?? "";
  };

  const cancelEditItem = () => {
    editingItemId = null;
  };

  const saveItem = async (itemId: string) => {
    if (!template || savingItem) return;
    const name = editName.trim();
    if (!name) return;
    savingItem = true;
    error = null;
    try {
      const payload = {
        name,
        qty: parseOptionalNumber(editQty),
      };
      const updated = await api.updateTemplateItem(template.id, itemId, payload);
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

  const createListFromTemplate = async () => {
    if (!template || creatingList) return;
    creatingList = true;
    error = null;
    try {
      const payload = { name: createListName.trim() || null };
      const created = await api.createListFromTemplate(template.id, payload);
      createListModalOpen = false;
      push(`/lists/${created.id}`);
    } catch (err) {
      const message = getApiErrorMessage(err, "Create failed.");
      if (message) {
        error = message;
      }
    } finally {
      creatingList = false;
    }
  };

  const openCreateListModal = () => {
    createListName = "";
    createListModalOpen = true;
  };

  const closeCreateListModal = () => {
    if (creatingList) return;
    createListModalOpen = false;
  };

  $: if (params.templateId && params.templateId !== currentTemplateId) {
    currentTemplateId = params.templateId;
    loadTemplate(currentTemplateId);
  }
</script>

<main>
  <header class="page-header">
    <div class="page-header-main">
      <div class="title-with-action">
        <button
          class="button ghost icon-button"
          type="button"
          aria-label="Edit template name"
          title="Edit name"
          on:click={openRenameModal}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.79 1.79 3.75 3.75 1.96-1.62z"
            />
          </svg>
        </button>
        <button
          class="button ghost icon-button"
          type="button"
          aria-label="Create list from template"
          title="Create list from template"
          on:click={openCreateListModal}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3.25 13.9 8.1l4.85 1.9-4.85 1.9L12 16.75l-1.9-4.85-4.85-1.9 4.85-1.9L12 3.25zm7.25 10.5.95 2.4 2.4.95-2.4.95-.95 2.4-.95-2.4-2.4-.95 2.4-.95.95-2.4zM4.75 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"
            />
          </svg>
        </button>
        <h1>{template ? template.name : "Template"}</h1>
      </div>
    </div>
    <div class="page-header-side">
      <p class="header-description">Keep your starter items polished.</p>
      <div class="nav-links">
        <NavMenu isAdmin={$authStore.user?.admin ?? false} />
      </div>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading template...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if !template}
    <p class="meta">Template not found.</p>
  {:else}
    <section class="card stack">
      <div class="row">
        <div>
          <h2>Template items ({items.length})</h2>
          <p class="meta">Add the staples you always buy.</p>
        </div>
      </div>

      {#if items.length === 0}
        <p class="meta">No items yet.</p>
      {:else}
        <div class="stack">
          {#each items as item (item.id)}
            <div
              class="card draggable-item"
              class:drag-over={dragOverItemId === item.id}
              class:dragging={draggedItemId === item.id}
              draggable={!editingItemId && !savingItem && !reorderingItems}
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
                  <div>
                    <h3>{item.name}</h3>
                    <div class="meta">
                      {#if item.qty !== null && item.qty !== undefined}
                        (x {item.qty})
                      {/if}
                    </div>
                  </div>
                  <div class="toolbar">
                    <button
                      class="button ghost icon-button qty-inline-button"
                      type="button"
                      aria-label={`Increase quantity for ${item.name}`}
                      disabled={updatingQtyItemId === item.id}
                      on:click={() => adjustTemplateItemQty(item, 1)}
                    >
                      +
                    </button>
                    <button
                      class="button ghost icon-button qty-inline-button"
                      type="button"
                      aria-label={`Decrease quantity for ${item.name}`}
                      disabled={updatingQtyItemId === item.id || (item.qty ?? 0) <= 1}
                      on:click={() => adjustTemplateItemQty(item, -1)}
                    >
                      -
                    </button>
                    <button
                      class="button ghost icon-button"
                      aria-label="Move up"
                      title="Move up"
                      disabled={!!editingItemId || savingItem || reorderingItems || items.indexOf(item) === 0}
                      on:click={() => moveItemUp(item.id)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
                      </svg>
                    </button>
                    <button
                      class="button ghost icon-button"
                      aria-label="Move down"
                      title="Move down"
                      disabled={!!editingItemId || savingItem || reorderingItems || items.indexOf(item) === items.length - 1}
                      on:click={() => moveItemDown(item.id)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" />
                      </svg>
                    </button>
                    <button
                      class="button ghost icon-button"
                      aria-label={`Insert item above ${item.name}`}
                      title="Insert above"
                      disabled={!!editingItemId || savingItem || reorderingItems}
                      on:click={() => openInsertModal(item.id, "above")}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M11 2h2v3h3v2h-3v3h-2V7H8V5h3V2zM4 14h16v2H4v-2zm0 4h16v2H4v-2z" />
                      </svg>
                    </button>
                    <button
                      class="button ghost icon-button"
                      aria-label={`Insert item below ${item.name}`}
                      title="Insert below"
                      disabled={!!editingItemId || savingItem || reorderingItems}
                      on:click={() => openInsertModal(item.id, "below")}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 4h16v2H4V4zM4 8h16v2H4V8zM11 22H13V19H16V17H13V14H11V17H8V19H11Z" />
                      </svg>
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
                      on:click={() => deleteTemplateItem(item.id)}
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
      aria-labelledby="add-template-item-title"
    >
      <h3 id="add-template-item-title">
        {insertTargetId
          ? insertSide === "below"
            ? "Insert item below"
            : "Insert item above"
          : "Add item"}
      </h3>
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
        <button class="button" disabled={creatingItem} on:click={createTemplateItem}>
          {creatingItem
            ? "Creating..."
            : insertTargetId
              ? "Insert item"
              : "Create item"}
        </button>
      </div>
    </section>
  </div>
{/if}

{#if createListModalOpen}
  <div class="modal-backdrop" role="presentation" on:click|self={closeCreateListModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-list-from-template-title"
    >
      <h3 id="create-list-from-template-title">Create list from template</h3>
      <p class="meta">Template: {template?.name ?? "Template"}</p>
      <input class="input" placeholder="Optional list name" bind:value={createListName} />
      <div class="toolbar">
        <button class="button ghost" disabled={creatingList} on:click={closeCreateListModal}>
          Cancel
        </button>
        <button class="button" disabled={creatingList} on:click={createListFromTemplate}>
          {creatingList ? "Creating..." : "Create list"}
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
      aria-labelledby="rename-template-title"
    >
      <h3 id="rename-template-title">Change template name</h3>
      <input class="input" placeholder="Template name" bind:value={templateName} />
      <div class="toolbar">
        <button class="button ghost" disabled={savingName} on:click={closeRenameModal}>
          Cancel
        </button>
        <button class="button" disabled={savingName} on:click={updateTemplateName}>
          {savingName ? "Saving..." : "Save name"}
        </button>
      </div>
    </section>
  </div>
{/if}
