<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import type { ListOut } from "../lib/types";
  import { clearToken } from "../stores/auth";

  let lists: ListOut[] = [];
  let loading = true;
  let error: string | null = null;
  let newName = "";
  let creating = false;
  let deletingId: string | null = null;

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
    } catch (err) {
      const message = getApiErrorMessage(err, "Create failed.");
      if (message) {
        error = message;
      }
    } finally {
      creating = false;
    }
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
      <button class="button secondary" on:click={logout}>Sign out</button>
    </div>
  </header>

  <section class="card stack">
    <div class="toolbar">
      <input
        class="input"
        placeholder="New list name"
        bind:value={newName}
      />
      <button class="button button-large" disabled={creating} on:click={createList}>
        {creating ? "Creating..." : "Create list"}
      </button>
    </div>
    <div class="toolbar">
      <button class="button ghost" on:click={() => push("/templates")}>
        Create from template
      </button>
    </div>
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
        <article class="card item-row">
          <div>
            <h2>{list.name}</h2>
            <p class="meta">Updated {formatDate(list.updated_at)}</p>
            {#if list.template_id}
              <span class="badge">From template</span>
            {/if}
          </div>
          <div class="toolbar">
            <button
              class="button icon-button"
              aria-label="Open"
              title="Open"
              on:click={() => push(`/lists/${list.id}`)}
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
              disabled={deletingId === list.id}
              on:click={() => deleteList(list.id)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9zM6 21h12l1-14H5l1 14z"
                />
              </svg>
            </button>
          </div>
        </article>
      {/each}
    </section>
  {/if}
</main>
