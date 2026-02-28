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

  let newItemName = "";
  let newItemQty = "";
  let creatingItem = false;

  let editingItemId: string | null = null;
  let editName = "";
  let editQty = "";
  let savingItem = false;

  let currentListId = "";

  const parseOptionalNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
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
      newItemQty = "";
    } catch (err) {
      const message = getApiErrorMessage(err, "Create failed.");
      if (message) {
        error = message;
      }
    } finally {
      creatingItem = false;
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
      <h1>{list ? list.name : "List"}</h1>
      <p>Manage items and keep things in sync.</p>
    </div>
    <div class="nav-links">
      <button class="button ghost" on:click={() => push("/lists")}>All lists</button>
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
          <h2>List details</h2>
          <p class="meta">Rename the list to keep it current.</p>
        </div>
        <div class="toolbar">
          <input class="input" bind:value={listName} />
          <button class="button" disabled={savingName} on:click={updateListName}>
            {savingName ? "Saving..." : "Save name"}
          </button>
        </div>
      </div>
    </section>

    <section class="card stack">
      <div>
        <h2>Items</h2>
        <p class="meta">Add, edit, or tick items as you shop.</p>
      </div>

      <div class="inline-form">
        <input class="input" placeholder="Item name" bind:value={newItemName} />
        <div class="flex">
          <input
            class="input"
            placeholder="Qty"
            bind:value={newItemQty}
          />
          <button class="button" disabled={creatingItem} on:click={createItem}>
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
                      <h3>{item.name}</h3>
                      <div class="meta">
                        {#if item.qty !== null && item.qty !== undefined}
                          (x {item.qty})
                        {/if}
                      </div>
                    </div>
                  </div>
                  <div class="toolbar">
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
  {/if}
</main>
