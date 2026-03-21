<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import type { PendingUserOut } from "../lib/types";
  import { authStore, clearToken } from "../stores/auth";

  let pendingUsers: PendingUserOut[] = [];
  let loading = true;
  let error: string | null = null;
  let approvingId: string | null = null;

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

  const logout = () => {
    clearToken();
    push("/login");
  };

  const approveUser = async (userId: string) => {
    if (approvingId) return;
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

  onMount(loadPendingUsers);
</script>

<main>
  <header class="page-header">
    <div>
      <h1>Pending user requests</h1>
      <p>Review users waiting for admin confirmation.</p>
    </div>
    <div class="nav-links">
      <button class="button ghost" on:click={() => push("/dashboard")}>
        Dashboard
      </button>
      <button class="button secondary" on:click={logout}>Sign out</button>
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
    <section class="list-grid">
      {#each pendingUsers as user}
        <article class="card stack">
          <h2>{user.name || user.email || "Unnamed user"}</h2>
          <p class="meta">{user.email || "No email"}</p>
          <p class="meta">Requested {formatDate(user.created_at)}</p>
          <div class="toolbar">
            <button
              class="button"
              disabled={approvingId === user.id}
              on:click={() => approveUser(user.id)}
            >
              {approvingId === user.id ? "Approving..." : "Approve"}
            </button>
          </div>
        </article>
      {/each}
    </section>
  {/if}
</main>
