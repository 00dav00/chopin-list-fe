<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api, ApiError } from "../lib/api";
  import ConfirmDialog from "../lib/ConfirmDialog.svelte";
  import { getApiErrorMessage } from "../lib/errors";
  import { failureMessage, refusalDetail } from "../lib/grouping";
  import NavMenu from "../lib/NavMenu.svelte";
  import { clearNotices, notify } from "../lib/notices";
  import type { UnmatchedEntryOut } from "../lib/types";
  import { authStore } from "../stores/auth";

  let entries: UnmatchedEntryOut[] = [];
  let loading = true;
  let loadError: string | null = null;

  let creatingFor: string | null = null;
  let groupName = "";
  let createError: string | null = null;
  let saving = false;

  let pendingDismissId: string | null = null;
  let dismissingId: string | null = null;
  let destroyed = false;

  $: pendingDismiss = entries.find((entry) => entry.id === pendingDismissId) ?? null;

  const formatDate = (value: string) => new Date(value).toLocaleDateString();

  const notifyFailure = (err: unknown, message: string) => {
    if (destroyed) return;
    const text = failureMessage(err, message);
    if (text) notify({ message: text, severity: "error" });
  };

  const loadEntries = async () => {
    if (!$authStore.user?.admin) {
      push("/dashboard");
      return;
    }
    loading = true;
    loadError = null;
    try {
      const loaded = await api.listUnmatchedItems();
      if (destroyed) return;
      entries = loaded;
      // The entry whose form was open may have been handled meanwhile.
      if (creatingFor && !entries.some((entry) => entry.id === creatingFor)) {
        creatingFor = null;
      }
    } catch (err) {
      if (destroyed) return;
      loadError = getApiErrorMessage(err, "Couldn't load the items.");
    } finally {
      loading = false;
    }
  };

  // Another admin got there first: show the list as it is now.
  const handleGone = async () => {
    if (destroyed) return;
    notify({ message: "Someone already handled that item.", severity: "warning", autoDismissMs: 5_000 });
    await loadEntries();
  };

  const isGone = (err: unknown) => err instanceof ApiError && err.status === 404;

  const remove = (entryId: string) => {
    entries = entries.filter((entry) => entry.id !== entryId);
  };

  const openCreate = (entry: UnmatchedEntryOut) => {
    if (saving) return;
    creatingFor = entry.id;
    // Shared names can run to 200 characters; group names stop at 60.
    groupName = entry.name.slice(0, 60);
    createError = null;
  };

  const cancelCreate = () => {
    if (saving) return;
    creatingFor = null;
    createError = null;
  };

  const createGroup = async () => {
    const entryId = creatingFor;
    const name = groupName.trim();
    if (!entryId || !name || saving) return;
    saving = true;
    createError = null;
    try {
      const group = await api.createGroupFromUnmatched(entryId, { name });
      if (destroyed) return;
      remove(entryId);
      creatingFor = null;
      notify({ message: `Added the group "${group.name}".`, severity: "success" });
    } catch (err) {
      if (isGone(err)) {
        creatingFor = null;
        await handleGone();
        return;
      }
      createError = refusalDetail(err);
      if (!createError) notifyFailure(err, "Couldn't create the group. Try again.");
    } finally {
      saving = false;
    }
  };

  const confirmDismiss = async () => {
    const entryId = pendingDismissId;
    if (!entryId || dismissingId) return;
    dismissingId = entryId;
    try {
      await api.dismissUnmatchedItem(entryId);
      remove(entryId);
    } catch (err) {
      if (isGone(err)) {
        await handleGone();
      } else {
        notifyFailure(err, "Couldn't dismiss that item. Try again.");
      }
    } finally {
      pendingDismissId = null;
      dismissingId = null;
    }
  };

  const cancelDismiss = () => {
    if (dismissingId) return;
    pendingDismissId = null;
  };

  onMount(loadEntries);
  onDestroy(() => {
    destroyed = true;
    clearNotices();
  });
</script>

<main>
  <header class="page-header">
    <div class="page-header-main">
      <h1>Unmatched items</h1>
    </div>
    <div class="page-header-side">
      <p class="header-description">
        Item names shoppers shared because they fit no group. Turn a common one into a group,
        or dismiss it.
      </p>
      <div class="nav-links">
        <NavMenu isAdmin={$authStore.user?.admin ?? false} />
      </div>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading items...</p>
  {:else if loadError}
    <section class="card stack">
      <p class="meta">{loadError}</p>
      <div class="toolbar">
        <button class="button" type="button" on:click={loadEntries}>Retry</button>
      </div>
    </section>
  {:else if entries.length === 0}
    <section class="card">
      <h2>Nothing to review</h2>
      <p>Shared items that fit no group will show up here.</p>
    </section>
  {:else}
    <section class="card stack">
      {#each entries as entry (entry.id)}
        <article class="stack unmatched-entry">
          <div class="row unmatched-row">
            <button
              class="button ghost unmatched-name"
              type="button"
              aria-label={`Create a group from ${entry.name}`}
              disabled={saving}
              on:click={() => openCreate(entry)}
            >
              {entry.name}
            </button>
            <span class="meta">
              Sent {entry.count} {entry.count === 1 ? "time" : "times"} · last {formatDate(entry.last_sent_at)}
            </span>
            <button
              class="button ghost"
              type="button"
              disabled={dismissingId !== null || saving}
              on:click={() => (pendingDismissId = entry.id)}
            >
              Dismiss
            </button>
          </div>
          {#if creatingFor === entry.id}
            <form class="inline-form" on:submit|preventDefault={createGroup}>
              <input
                class="input"
                aria-label="Group name"
                maxlength="60"
                bind:value={groupName}
              />
              <div class="toolbar">
                <button class="button" type="submit" disabled={saving || !groupName.trim()}>
                  {saving ? "Creating..." : "Create group"}
                </button>
                <button class="button ghost" type="button" on:click={cancelCreate}>
                  Cancel
                </button>
              </div>
            </form>
            {#if createError}
              <p class="meta field-error" role="alert">{createError}</p>
            {/if}
            <p class="meta">The new group goes at the end, just above "Other".</p>
          {/if}
        </article>
      {/each}
    </section>
  {/if}
</main>

<ConfirmDialog
  open={pendingDismissId !== null}
  title={`Dismiss "${pendingDismiss?.name ?? ""}"?`}
  message="It leaves this list. If a shopper shares it again later, it comes back."
  confirmLabel="Dismiss"
  busyLabel="Dismissing..."
  busy={dismissingId !== null}
  danger={false}
  on:confirm={confirmDismiss}
  on:cancel={cancelDismiss}
/>

<style>
  .unmatched-row {
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .unmatched-name {
    font-weight: 600;
  }
</style>
