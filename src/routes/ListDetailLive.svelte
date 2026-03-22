<script lang="ts">
  import { onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import NavMenu from "../lib/NavMenu.svelte";
  import {
    connectLiveListSocket,
    type RealtimeConnection,
    type RealtimeStatus,
  } from "../lib/realtime";
  import type { ItemOut, ListOut } from "../lib/types";
  import { authStore } from "../stores/auth";

  export let params: { listId?: string } = {};

  let list: ListOut | null = null;
  let items: ItemOut[] = [];
  let loading = true;
  let refreshing = false;
  let error: string | null = null;
  let currentListId = "";
  let socketKey = "";
  let realtimeStatus: RealtimeStatus = "closed";
  let realtimeConnection: RealtimeConnection | null = null;

  const sortItems = (nextItems: ItemOut[]) =>
    [...nextItems].sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const closeRealtime = () => {
    realtimeConnection?.close();
    realtimeConnection = null;
    socketKey = "";
    realtimeStatus = "closed";
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

  const refreshList = async (listId: string) => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    try {
      const [listData, itemData] = await Promise.all([
        api.getList(listId),
        api.listItems(listId),
      ]);
      list = listData;
      items = sortItems(itemData);
    } catch {
      // Keep showing current state; next event will retry.
    } finally {
      refreshing = false;
    }
  };

  const connectRealtime = (listId: string, token: string) => {
    const nextSocketKey = `${listId}:${token}`;
    if (socketKey === nextSocketKey) {
      return;
    }
    closeRealtime();
    socketKey = nextSocketKey;
    realtimeConnection = connectLiveListSocket({
      listId,
      token,
      onStatusChange: (status) => {
        realtimeStatus = status;
      },
      onEvent: () => {
        refreshList(listId);
      },
    });
  };

  $: isAdmin = $authStore.user?.admin ?? false;

  $: if (params.listId && params.listId !== currentListId) {
    currentListId = params.listId;
    loadList(currentListId);
  }

  $: if (currentListId && !isAdmin) {
    closeRealtime();
    push(`/lists/${currentListId}`);
  }

  $: if (currentListId && isAdmin && $authStore.token) {
    connectRealtime(currentListId, $authStore.token);
  }

  onDestroy(() => {
    closeRealtime();
  });
</script>

<main>
  <header class="page-header">
    <div class="page-header-main">
      <h1>Live list monitor</h1>
      <p class="meta">New experience for near real-time list refresh.</p>
    </div>
    <div class="page-header-side">
      <div class="nav-links">
        <NavMenu isAdmin={$authStore.user?.admin ?? false} />
      </div>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading live list...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if !list}
    <p class="meta">List not found.</p>
  {:else}
    <section class="card stack">
      <div class="row">
        <div>
          <h2>{list.name}</h2>
          <p class="meta">List id: {list.id}</p>
        </div>
        <div class="toolbar">
          <span class="pill">{realtimeStatus}</span>
          {#if refreshing}
            <span class="meta">Refreshing...</span>
          {/if}
        </div>
      </div>

      {#if items.length === 0}
        <p class="meta">No items yet.</p>
      {:else}
        <div class="stack">
          {#each items as item (item.id)}
            <article class="card item-row compact-item-card">
              <div class="item-main">
                <input class="item-checkbox" type="checkbox" checked={item.purchased} disabled />
                <div>
                  <h3>{item.name}</h3>
                  <p class="meta">Qty: {item.qty ?? 0}</p>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</main>
