<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import type { ListOut } from "../lib/types";
  import { authStore, clearToken } from "../stores/auth";

  let lists: ListOut[] = [];
  let loading = true;
  let error: string | null = null;
  let newName = "";
  let creating = false;
  let createListModalOpen = false;
  let deletingId: string | null = null;
  let updatingStateId: string | null = null;

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
    if (!window.confirm("Delete this list?")) return;
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

  const logout = () => {
    clearToken();
    push("/login");
  };

  onMount(loadLists);
</script>

<main>
  <header class="page-header">
    <div>
      <h1>Your Lists</h1>
      <p>Open a list or start a new one in seconds.</p>
    </div>
    <div class="nav-links">
      <button class="button ghost" on:click={() => push("/dashboard")}>
        Dashboard
      </button>
      <button class="button ghost" on:click={() => push("/templates")}>
        Templates
      </button>
      {#if $authStore.user?.admin}
        <button class="button ghost" on:click={() => push("/admin/active-users")}>
          Active users
        </button>
      {/if}
      <button class="button secondary" on:click={logout}>Sign out</button>
    </div>
  </header>

  <section class="toolbar">
    <button class="button" on:click={openCreateListModal}>Add list</button>
    <button class="button ghost" on:click={() => push("/templates")}>Create from template</button>
  </section>

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
            <h2>{list.name}</h2>
            <p class="meta">Updated {formatDate(list.updated_at)}</p>
            <p class="meta">{list.items_count} items</p>
            {#if list.template_id}
              <span class="badge">From template</span>
            {/if}
          </div>
          <div class="toolbar">
              <button
                class="button ghost"
                disabled={updatingStateId === list.id}
                on:click|stopPropagation={() => completeList(list.id)}
              >
                Mark complete
              </button>
              <button
                class="button danger icon-button"
                aria-label="Delete"
                title="Delete"
                disabled={deletingId === list.id}
                on:click|stopPropagation={() => deleteList(list.id)}
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
