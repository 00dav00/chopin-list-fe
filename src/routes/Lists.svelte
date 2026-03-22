<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import NavMenu from "../lib/NavMenu.svelte";
  import type { ListOut } from "../lib/types";
  import { authStore } from "../stores/auth";

  let lists: ListOut[] = [];
  let loading = true;
  let error: string | null = null;
  let newName = "";
  let creating = false;
  let createListModalOpen = false;
  let deletingId: string | null = null;
  let updatingStateId: string | null = null;
  let completeModalList: ListOut | null = null;
  let deleteModalList: ListOut | null = null;

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString();

  const loadLists = async () => {
    loading = true;
    error = null;
    try {
      lists = await api.listLists();
    } catch (err) {
      const message = getApiErrorMessage(err, "Load failed.");
      if (message) {
        error = message;
      }
    } finally {
      loading = false;
    }
  };

  const createList = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    creating = true;
    error = null;
    try {
      const created = await api.createList({ name });
      lists = [created, ...lists];
      newName = "";
      createListModalOpen = false;
    } catch (err) {
      const message = getApiErrorMessage(err, "Create failed.");
      if (message) {
        error = message;
      }
    } finally {
      creating = false;
    }
  };

  const openCreateListModal = () => {
    newName = "";
    createListModalOpen = true;
  };

  const closeCreateListModal = () => {
    if (creating) return;
    createListModalOpen = false;
  };

  const deleteList = async (listId: string) => {
    if (deletingId) return;
    deletingId = listId;
    error = null;
    try {
      await api.deleteList(listId);
      lists = lists.filter((list) => list.id !== listId);
    } catch (err) {
      const message = getApiErrorMessage(err, "Delete failed.");
      if (message) {
        error = message;
      }
    } finally {
      deletingId = null;
    }
  };

  const openDeleteListModal = (list: ListOut) => {
    if (deletingId) return;
    deleteModalList = list;
  };

  const closeDeleteListModal = () => {
    if (deletingId) return;
    deleteModalList = null;
  };

  const confirmDeleteList = async () => {
    if (!deleteModalList) return;
    const listId = deleteModalList.id;
    await deleteList(listId);
    if (!error) {
      deleteModalList = null;
    }
  };

  const completeList = async (listId: string) => {
    if (updatingStateId) return;
    updatingStateId = listId;
    error = null;
    try {
      await api.completeList(listId);
      lists = lists.filter((list) => list.id !== listId);
    } catch (err) {
      const message = getApiErrorMessage(err, "Complete failed.");
      if (message) {
        error = message;
      }
    } finally {
      updatingStateId = null;
    }
  };

  const openCompleteListModal = (list: ListOut) => {
    if (updatingStateId) return;
    completeModalList = list;
  };

  const closeCompleteListModal = () => {
    if (updatingStateId) return;
    completeModalList = null;
  };

  const confirmCompleteList = async () => {
    if (!completeModalList) return;
    const listId = completeModalList.id;
    await completeList(listId);
    if (!error) {
      completeModalList = null;
    }
  };

  onMount(loadLists);
</script>

<main>
  <header class="page-header">
    <div class="page-header-main">
      <h1>Your Lists</h1>
    </div>
    <div class="page-header-side">
      <p class="header-description">Open a list or start a new one in seconds.</p>
      <div class="nav-links">
        <NavMenu isAdmin={$authStore.user?.admin ?? false} />
      </div>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading lists...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if lists.length === 0}
    <section class="card">
      <h2>No lists yet</h2>
      <p>Create your first list or start from a template.</p>
    </section>
  {:else}
    <section class="list-grid">
      {#each lists as list}
        <div
          class="card item-row card-clickable"
          role="button"
          tabindex="0"
          on:click={() => push(`/lists/${list.id}`)}
          on:keydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              push(`/lists/${list.id}`);
            }
          }}
        >
          <div>
            <div class="inline-heading-meta">
              <h2>{list.name}</h2>
              <span class="title-inline-count">({list.items_count})</span>
            </div>
            <div class="list-card-meta-line">
              <p class="meta">Updated at {formatDate(list.updated_at)}</p>
              {#if list.template_id}
                <span class="list-card-meta-separator" aria-hidden="true">·</span>
                <p class="meta">From template</p>
              {/if}
            </div>
          </div>
          <div class="toolbar">
            <button
              class="button ghost icon-button list-card-action"
              aria-label="Archive list"
              title="Mark complete"
              disabled={updatingStateId === list.id}
              on:click|stopPropagation={() => openCompleteListModal(list)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M3 4h18v4h-1v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8H3V4zm3 4v11h12V8H6zm4 3h4v2h-4v-2z"
                />
              </svg>
            </button>
            <button
              class="button danger icon-button list-card-action"
              aria-label="Delete"
              title="Delete"
              disabled={deletingId === list.id}
              on:click|stopPropagation={() => openDeleteListModal(list)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9zM6 21h12l1-14H5l1 14z"
                />
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </section>
  {/if}

  <button class="button floating-add-item" on:click={openCreateListModal}>Add list</button>

</main>

{#if createListModalOpen}
  <div class="modal-backdrop" role="presentation" on:click|self={closeCreateListModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-list-title"
    >
      <h3 id="create-list-title">Create list</h3>
      <input class="input" placeholder="New list name" bind:value={newName} />
      <div class="toolbar">
        <button class="button ghost" disabled={creating} on:click={closeCreateListModal}>
          Cancel
        </button>
        <button class="button" disabled={creating} on:click={createList}>
          {creating ? "Creating..." : "Create list"}
        </button>
      </div>
    </section>
  </div>
{/if}

{#if completeModalList}
  <div class="modal-backdrop" role="presentation" on:click|self={closeCompleteListModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-list-title"
    >
      <h3 id="complete-list-title">Mark list complete?</h3>
      <p class="meta">This moves <strong>{completeModalList.name}</strong> to Completed lists.</p>
      {#if (completeModalList.unpurchased_items_count ?? 0) > 0}
        <p class="meta">
          This list still has {completeModalList.unpurchased_items_count} unpurchased items.
        </p>
      {/if}
      <div class="toolbar">
        <button class="button ghost" disabled={updatingStateId !== null} on:click={closeCompleteListModal}>
          Cancel
        </button>
        <button class="button" disabled={updatingStateId !== null} on:click={confirmCompleteList}>
          {updatingStateId !== null ? "Completing..." : "Mark complete"}
        </button>
      </div>
    </section>
  </div>
{/if}

{#if deleteModalList}
  <div class="modal-backdrop" role="presentation" on:click|self={closeDeleteListModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-list-title"
    >
      <h3 id="delete-list-title">Delete list?</h3>
      <p class="meta">
        This permanently deletes <strong>{deleteModalList.name}</strong> and its items.
      </p>
      <div class="toolbar">
        <button class="button ghost" disabled={deletingId !== null} on:click={closeDeleteListModal}>
          Cancel
        </button>
        <button class="button danger" disabled={deletingId !== null} on:click={confirmDeleteList}>
          {deletingId !== null ? "Deleting..." : "Delete list"}
        </button>
      </div>
    </section>
  </div>
{/if}
