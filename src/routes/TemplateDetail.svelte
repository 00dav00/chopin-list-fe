<script lang="ts">
  import { push } from "svelte-spa-router";
  import { api, ApiError } from "../lib/api";
  import type { TemplateDetailOut, TemplateItemOut } from "../lib/types";
  import { clearToken } from "../stores/auth";

  export let params: { templateId?: string } = {};

  let template: TemplateDetailOut | null = null;
  let items: TemplateItemOut[] = [];
  let loading = true;
  let error: string | null = null;
  let templateName = "";
  let savingName = false;

  let newItemName = "";
  let newItemQty = "";
  let newItemUnit = "";
  let newItemSort = "0";
  let creatingItem = false;

  let editingItemId: string | null = null;
  let editName = "";
  let editQty = "";
  let editUnit = "";
  let editSort = "0";
  let savingItem = false;

  let createListName = "";
  let creatingList = false;

  let currentTemplateId = "";

  const parseOptionalNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const parseSortOrder = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
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

  const loadTemplate = async (templateId: string) => {
    loading = true;
    error = null;
    try {
      const data = await api.getTemplate(templateId);
      template = data;
      items = sortItems(data.items);
      templateName = data.name;
    } catch (err) {
      error = err instanceof ApiError ? err.detail || err.message : "Load failed.";
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
    } catch (err) {
      error = err instanceof ApiError ? err.detail || err.message : "Update failed.";
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
        unit: newItemUnit.trim() || null,
        sort_order: parseSortOrder(newItemSort),
      };
      const created = await api.createTemplateItem(template.id, payload);
      items = sortItems([...items, created]);
      newItemName = "";
      newItemQty = "";
      newItemUnit = "";
      newItemSort = "0";
    } catch (err) {
      error = err instanceof ApiError ? err.detail || err.message : "Create failed.";
    } finally {
      creatingItem = false;
    }
  };

  const deleteTemplateItem = async (itemId: string) => {
    if (!template) return;
    if (!window.confirm("Delete this template item?")) return;
    error = null;
    try {
      await api.deleteTemplateItem(template.id, itemId);
      items = items.filter((item) => item.id !== itemId);
    } catch (err) {
      error = err instanceof ApiError ? err.detail || err.message : "Delete failed.";
    }
  };

  const startEditItem = (item: TemplateItemOut) => {
    editingItemId = item.id;
    editName = item.name;
    editQty = item.qty?.toString() ?? "";
    editUnit = item.unit ?? "";
    editSort = item.sort_order.toString();
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
        unit: editUnit.trim() || null,
        sort_order: parseSortOrder(editSort),
      };
      const updated = await api.updateTemplateItem(template.id, itemId, payload);
      items = sortItems(
        items.map((item) => (item.id === itemId ? updated : item))
      );
      editingItemId = null;
    } catch (err) {
      error = err instanceof ApiError ? err.detail || err.message : "Update failed.";
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
      error = err instanceof ApiError ? err.detail || err.message : "Create failed.";
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
      <h1>{template ? template.name : "Template"}</h1>
      <p>Keep your starter items polished.</p>
    </div>
    <div class="nav-links">
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
      <div class="row">
        <div>
          <h2>Template details</h2>
          <p class="meta">Rename the template to keep it tidy.</p>
        </div>
        <div class="toolbar">
          <input class="input" bind:value={templateName} />
          <button class="button" disabled={savingName} on:click={updateTemplateName}>
            {savingName ? "Saving..." : "Save name"}
          </button>
        </div>
      </div>
    </section>

    <section class="card stack">
      <div>
        <h2>Template items</h2>
        <p class="meta">Add the staples you always buy.</p>
      </div>

      <div class="inline-form">
        <input class="input" placeholder="Item name" bind:value={newItemName} />
        <div class="flex">
          <input class="input" placeholder="Qty" bind:value={newItemQty} />
          <input class="input" placeholder="Unit" bind:value={newItemUnit} />
          <input class="input" placeholder="Sort" bind:value={newItemSort} />
          <button class="button" disabled={creatingItem} on:click={createTemplateItem}>
            {creatingItem ? "Adding..." : "Add item"}
          </button>
        </div>
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
                  <div class="flex">
                    <input class="input" placeholder="Qty" bind:value={editQty} />
                    <input class="input" placeholder="Unit" bind:value={editUnit} />
                    <input class="input" placeholder="Sort" bind:value={editSort} />
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
                        {item.qty}
                      {/if}
                      {#if item.unit}
                        {" "}{item.unit}
                      {/if}
                      {#if item.sort_order !== undefined && item.sort_order !== null}
                        <span class="pill">Order {item.sort_order}</span>
                      {/if}
                    </div>
                  </div>
                  <div class="toolbar">
                    <button class="button ghost" on:click={() => startEditItem(item)}>
                      Edit
                    </button>
                    <button
                      class="button danger"
                      on:click={() => deleteTemplateItem(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

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
  {/if}
</main>
