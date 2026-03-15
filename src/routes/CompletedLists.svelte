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
  let updatingStateId: string | null = null;

  const formatDate = (value: string) => new Date(value).toLocaleDateString();

  const loadLists = async () => {
    loading = true;
    error = null;
    try {
      lists = await api.listCompletedLists();
    } catch (err) {
      const message = getApiErrorMessage(err, "Load failed.");
      if (message) {
        error = message;
      }
    } finally {
      loading = false;
    }
  };

  const activateList = async (listId: string) => {
    if (updatingStateId) return;
    updatingStateId = listId;
    error = null;
    try {
      await api.activateList(listId);
      lists = lists.filter((list) => list.id !== listId);
    } catch (err) {
      const message = getApiErrorMessage(err, "Activate failed.");
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
      <h1>Completed Lists</h1>
      <p>Review done lists and reactivate anything you need.</p>
    </div>
    <div class="nav-links">
      <button class="button ghost" on:click={() => push("/dashboard")}>Dashboard</button>
      <button class="button ghost" on:click={() => push("/lists")}>Active lists</button>
      <button class="button ghost" on:click={() => push("/templates")}>Templates</button>
      <button class="button secondary" on:click={logout}>Sign out</button>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading completed lists...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if lists.length === 0}
    <section class="card">
      <h2>No completed lists</h2>
      <p>When you complete lists they will show here.</p>
    </section>
  {:else}
    <section class="list-grid">
      {#each lists as list}
        <article class="card item-row">
          <div>
            <h2>{list.name}</h2>
            <p class="meta">Updated {formatDate(list.updated_at)}</p>
            <p class="meta">{list.items_count} items</p>
          </div>
          <div class="toolbar">
            <button
              class="button ghost"
              aria-label="Open"
              on:click={() => push(`/lists/${list.id}`)}
            >
              Open
            </button>
            <button
              class="button"
              disabled={updatingStateId === list.id}
              on:click={() => activateList(list.id)}
            >
              Mark active
            </button>
          </div>
        </article>
      {/each}
    </section>
  {/if}
</main>
