<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import NavMenu from "../lib/NavMenu.svelte";
  import type { PendingUserOut } from "../lib/types";
  import { authStore } from "../stores/auth";

  let pendingUsers: PendingUserOut[] = [];
  let loading = true;
  let error: string | null = null;
  let approvingId: string | null = null;
  let deletingId: string | null = null;

  const formatDate = (value: string) => new Date(value).toLocaleDateString();

  const loadPendingUsers = async () => {
    if (!$authStore.user?.admin) {
      push("/dashboard");
      return;
    }

    loading = true;
    error = null;
    try {
      pendingUsers = await api.listPendingUsers();
    } catch (err) {
      const message = getApiErrorMessage(err, "Load failed.");
      if (message) {
        error = message;
      }
    } finally {
      loading = false;
    }
  };

  const approveUser = async (userId: string) => {
    if (approvingId || deletingId) return;
    approvingId = userId;
    error = null;
    try {
      await api.approveUser(userId);
      pendingUsers = pendingUsers.filter((user) => user.id !== userId);
    } catch (err) {
      const message = getApiErrorMessage(err, "Approve failed.");
      if (message) {
        error = message;
      }
    } finally {
      approvingId = null;
    }
  };

  const deletePendingUser = async (userId: string) => {
    if (approvingId || deletingId) return;
    if (!window.confirm("Delete this pending user and all their data?")) return;
    deletingId = userId;
    error = null;
    try {
      await api.deletePendingUser(userId);
      pendingUsers = pendingUsers.filter((user) => user.id !== userId);
    } catch (err) {
      const message = getApiErrorMessage(err, "Delete failed.");
      if (message) {
        error = message;
      }
    } finally {
      deletingId = null;
    }
  };

  onMount(loadPendingUsers);
</script>

<main>
  <header class="page-header">
    <div class="page-header-main">
      <h1>Pending user requests</h1>
    </div>
    <div class="page-header-side">
      <p class="header-description">Review users waiting for admin confirmation.</p>
      <div class="nav-links">
        <NavMenu isAdmin={$authStore.user?.admin ?? false} />
      </div>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading pending users...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if pendingUsers.length === 0}
    <section class="card">
      <h2>No pending users</h2>
      <p>All user requests are already handled.</p>
    </section>
  {:else}
    <section class="card stack">
      {#each pendingUsers as user}
        <article class="pending-user-row">
          <p class="meta pending-user-main">
            <strong>{user.name || "Unnamed user"}</strong>
            - {user.email || "No email"} - requested {formatDate(user.created_at)}
          </p>
          <div class="toolbar">
            <button
              class="button"
              disabled={approvingId === user.id || deletingId === user.id}
              on:click={() => approveUser(user.id)}
            >
              {approvingId === user.id ? "Approving..." : "Approve"}
            </button>
            <button
              class="button danger"
              disabled={approvingId === user.id || deletingId === user.id}
              on:click={() => deletePendingUser(user.id)}
            >
              {deletingId === user.id ? "Deleting..." : "Delete"}
            </button>
          </div>
        </article>
      {/each}
    </section>
  {/if}
</main>
