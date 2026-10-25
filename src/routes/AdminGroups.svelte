<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api, ApiError } from "../lib/api";
  import ConfirmDialog from "../lib/ConfirmDialog.svelte";
  import { getApiErrorMessage } from "../lib/errors";
  import { failureMessage, refusalDetail } from "../lib/grouping";
  import NavMenu from "../lib/NavMenu.svelte";
  import { clearNotices, notify } from "../lib/notices";
  import type { GroupOut } from "../lib/types";
  import { authStore } from "../stores/auth";

  let groups: GroupOut[] = [];
  let loading = true;
  let loadError: string | null = null;

  let newName = "";
  let adding = false;
  let addError: string | null = null;

  let editingId: string | null = null;
  let editName = "";
  let renameError: string | null = null;
  let savingId: string | null = null;

  let pendingDeleteId: string | null = null;
  let deletingId: string | null = null;
  let moving = false;
  let destroyed = false;

  // "Other" is built in and always last; only stored groups can change.
  $: stored = groups.filter((group) => !group.built_in);
  $: busy = adding || savingId !== null || deletingId !== null || moving;
  $: pendingDelete = groups.find((group) => group.id === pendingDeleteId) ?? null;

  const notifyFailure = (err: unknown, message: string) => {
    if (destroyed) return;
    const text = failureMessage(err, message);
    if (text) notify({ message: text, severity: "error" });
  };

  // Another admin changed the groups since this page loaded: a group is gone
  // (404) or the reorder no longer names every group (400). Show the latest.
  const isStale = (err: unknown) =>
    err instanceof ApiError && (err.status === 404 || err.status === 400);

  const reloadStale = async () => {
    if (destroyed) return;
    editingId = null;
    renameError = null;
    notify({
      message: "Someone else changed the groups. Here's the latest list.",
      severity: "warning",
      autoDismissMs: 5_000,
    });
    await loadGroups();
  };

  const loadGroups = async () => {
    if (!$authStore.user?.admin) {
      push("/dashboard");
      return;
    }
    loading = true;
    loadError = null;
    try {
      const loaded = await api.listGroups();
      if (destroyed) return;
      groups = loaded;
    } catch (err) {
      if (destroyed) return;
      loadError = getApiErrorMessage(err, "Couldn't load the groups.");
    } finally {
      loading = false;
    }
  };

  const addGroup = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    adding = true;
    addError = null;
    try {
      const created = await api.createGroup({ name });
      groups = [...groups, created];
      newName = "";
    } catch (err) {
      addError = refusalDetail(err);
      if (!addError) notifyFailure(err, "Couldn't add the group. Try again.");
    } finally {
      adding = false;
    }
  };

  const startRename = (group: GroupOut) => {
    if (busy) return;
    editingId = group.id;
    editName = group.name;
    renameError = null;
  };

  const cancelRename = () => {
    if (savingId) return;
    editingId = null;
    renameError = null;
  };

  const saveRename = async (groupId: string) => {
    const name = editName.trim();
    // A rename landing while a reorder is saving could be reverted by its rollback.
    if (!name || busy) return;
    savingId = groupId;
    renameError = null;
    try {
      const renamed = await api.renameGroup(groupId, { name });
      groups = groups.map((group) => (group.id === groupId ? renamed : group));
      editingId = null;
    } catch (err) {
      if (isStale(err)) {
        await reloadStale();
        return;
      }
      renameError = refusalDetail(err);
      if (!renameError) notifyFailure(err, "Couldn't rename the group. Try again.");
    } finally {
      savingId = null;
    }
  };

  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (busy || target < 0 || target >= stored.length) return;
    const previous = groups;
    const reordered = [...stored];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    groups = [...reordered, ...groups.filter((group) => group.built_in)];
    moving = true;
    try {
      groups = await api.reorderGroups(reordered.map((group) => group.id));
    } catch (err) {
      if (isStale(err)) {
        await reloadStale();
        return;
      }
      groups = previous;
      notifyFailure(err, "Couldn't save the new order — the groups are back to how they were.");
    } finally {
      moving = false;
    }
  };

  const confirmDelete = async () => {
    const groupId = pendingDeleteId;
    if (!groupId || deletingId) return;
    deletingId = groupId;
    try {
      await api.deleteGroup(groupId);
      groups = groups.filter((group) => group.id !== groupId);
      pendingDeleteId = null;
    } catch (err) {
      pendingDeleteId = null;
      if (isStale(err)) {
        await reloadStale();
        return;
      }
      notifyFailure(err, "Couldn't delete the group. Try again.");
    } finally {
      deletingId = null;
    }
  };

  const cancelDelete = () => {
    if (deletingId) return;
    pendingDeleteId = null;
  };

  onMount(loadGroups);
  onDestroy(() => {
    destroyed = true;
    clearNotices();
  });
</script>

<main>
  <header class="page-header">
    <div class="page-header-main">
      <h1>Groups</h1>
    </div>
    <div class="page-header-side">
      <p class="header-description">
        The kinds of product "Group by kind" sorts items into, in shopping order.
      </p>
      <div class="nav-links">
        <NavMenu isAdmin={$authStore.user?.admin ?? false} />
      </div>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading groups...</p>
  {:else if loadError}
    <section class="card stack">
      <p class="meta">{loadError}</p>
      <div class="toolbar">
        <button class="button" type="button" on:click={loadGroups}>Retry</button>
      </div>
    </section>
  {:else}
    <section class="card stack">
      {#if stored.length === 0}
        <p class="meta">No groups yet. Add the first one below.</p>
      {/if}
      <ol class="stack group-list">
        {#each stored as group, index (group.id)}
          <li class="row group-row">
            {#if editingId === group.id}
              <div class="inline-form">
                <input
                  class="input"
                  aria-label={`New name for ${group.name}`}
                  maxlength="60"
                  bind:value={editName}
                />
                <div class="toolbar">
                  <button
                    class="button"
                    type="button"
                    disabled={busy}
                    on:click={() => saveRename(group.id)}
                  >
                    {savingId === group.id ? "Saving..." : "Save"}
                  </button>
                  <button class="button ghost" type="button" on:click={cancelRename}>
                    Cancel
                  </button>
                </div>
                {#if renameError}
                  <p class="meta field-error" role="alert">{renameError}</p>
                {/if}
              </div>
            {:else}
              <span class="group-name">{group.name}</span>
              <div class="toolbar">
                <button
                  class="button ghost icon-button"
                  type="button"
                  aria-label={`Move ${group.name} up`}
                  disabled={busy || index === 0}
                  on:click={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  class="button ghost icon-button"
                  type="button"
                  aria-label={`Move ${group.name} down`}
                  disabled={busy || index === stored.length - 1}
                  on:click={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  class="button ghost"
                  type="button"
                  disabled={busy}
                  on:click={() => startRename(group)}
                >
                  Rename
                </button>
                <button
                  class="button ghost danger"
                  type="button"
                  disabled={busy}
                  on:click={() => (pendingDeleteId = group.id)}
                >
                  Delete
                </button>
              </div>
            {/if}
          </li>
        {/each}
        <li class="row group-row group-row-builtin">
          <span class="group-name">Other</span>
          <span class="meta">Built in · always last</span>
        </li>
      </ol>

      <form class="inline-form" on:submit|preventDefault={addGroup}>
        <input
          class="input"
          placeholder="New group name"
          aria-label="New group name"
          maxlength="60"
          bind:value={newName}
        />
        <button class="button" type="submit" disabled={busy || !newName.trim()}>
          {adding ? "Adding..." : "Add group"}
        </button>
      </form>
      {#if addError}
        <p class="meta field-error" role="alert">{addError}</p>
      {/if}
      <p class="meta">New groups go at the end, just above "Other". Use the arrows to move them.</p>
    </section>
  {/if}
</main>

<ConfirmDialog
  open={pendingDeleteId !== null}
  title={`Delete "${pendingDelete?.name ?? ""}"?`}
  message="Items in this group will go to Other until the next time a shopper groups their list."
  confirmLabel="Delete group"
  busyLabel="Deleting..."
  busy={deletingId !== null}
  on:confirm={confirmDelete}
  on:cancel={cancelDelete}
/>

<style>
  .group-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .group-row {
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .group-row-builtin {
    opacity: 0.75;
  }

  .group-name {
    font-weight: 600;
  }
</style>
