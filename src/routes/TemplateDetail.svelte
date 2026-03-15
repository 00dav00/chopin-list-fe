<script lang="ts">
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import type { TemplateDetailOut, TemplateItemOut } from "../lib/types";
  import { clearToken } from "../stores/auth";

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

  let editingItemId: string | null = null;
  let editName = "";
  let editQty = "";
  let savingItem = false;
  let updatingQtyItemId: string | null = null;

  let createListName = "";
  let creatingList = false;

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
    try {
      const payload = {
        name,
        qty: parseOptionalNumber(newItemQty),
        sort_order: nextSortOrder(items),
      };
      const created = await api.createTemplateItem(template.id, payload);
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

  const closeAddItemModal = () => {
    if (creatingItem) return;
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

  const logout = () => {
    clearToken();
    push("/login");
  };

  $: if (params.templateId && params.templateId !== currentTemplateId) {
    currentTemplateId = params.templateId;
    loadTemplate(currentTemplateId);
  }
</script>

<main>
  <header class="page-header">
    <div>
      <div class="title-with-action">
        <h1>{template ? template.name : "Template"}</h1>
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
      </div>
      <p>Keep your starter items polished.</p>
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
    <p class="meta">Loading template...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if !template}
    <p class="meta">Template not found.</p>
  {:else}
    <section class="card stack">
      <div>
        <h2>Create list from template</h2>
        <p class="meta">Spin up a list with these items in one tap.</p>
      </div>
      <div class="toolbar">
        <input
          class="input"
          placeholder="Optional list name"
          bind:value={createListName}
        />
        <button class="button" disabled={creatingList} on:click={createListFromTemplate}>
          {creatingList ? "Creating..." : "Create list"}
        </button>
      </div>
    </section>

    <section class="card stack">
      <div class="row">
        <div>
          <h2>Template items</h2>
          <p class="meta">Add the staples you always buy.</p>
        </div>
        <button class="button" on:click={openAddItemModal}>Add item</button>
      </div>

      {#if items.length === 0}
        <p class="meta">No items yet.</p>
      {:else}
        <div class="stack">
          {#each items as item}
            <div class="card">
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
                      disabled={updatingQtyItemId === item.id}
                      on:click={() => adjustTemplateItemQty(item, -1)}
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
      <h3 id="add-template-item-title">Add item</h3>
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
