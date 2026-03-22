<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import NavMenu from "../lib/NavMenu.svelte";
  import type { ConfirmedUserOut } from "../lib/types";
  import { authStore } from "../stores/auth";

  let activeUsers: ConfirmedUserOut[] = [];
  let loading = true;
  let error: string | null = null;
  let unconfirmingId: string | null = null;

  const formatDate = (value: string) => new Date(value).toLocaleDateString();

  const loadActiveUsers = async () => {
    if (!$authStore.user?.admin) {
      push("/dashboard");
      return;
    }

    loading = true;
    error = null;
    try {
      activeUsers = await api.listConfirmedUsers();
    } catch (err) {
      const message = getApiErrorMessage(err, "Load failed.");
      if (message) {
        error = message;
      }
    } finally {
      loading = false;
    }
  };

  const unconfirmUser = async (userId: string) => {
    if (unconfirmingId) return;
    unconfirmingId = userId;
    error = null;
    try {
      await api.unconfirmUser(userId);
      activeUsers = activeUsers.filter((user) => user.id !== userId);
    } catch (err) {
      const message = getApiErrorMessage(err, "Update failed.");
      if (message) {
        error = message;
      }
    } finally {
      unconfirmingId = null;
    }
  };

  onMount(loadActiveUsers);
</script>

<main>
  <header class="page-header">
    <div class="page-header-main">
      <h1>Active users</h1>
    </div>
    <div class="page-header-side">
      <p class="header-description">Manage confirmed users and move them back to pending.</p>
      <div class="nav-links">
        <NavMenu isAdmin={$authStore.user?.admin ?? false} />
      </div>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading active users...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if activeUsers.length === 0}
    <section class="card">
      <h2>No active users</h2>
      <p>Approve pending users to see them here.</p>
    </section>
  {:else}
    <section class="card stack">
      {#each activeUsers as user}
        <article class="pending-user-row">
          <p class="meta pending-user-main">
            <strong>{user.name || "Unnamed user"}</strong>
            - {user.email || "No email"} - confirmed {formatDate(user.created_at)}
          </p>
          <div class="toolbar">
            <button
              class="button ghost"
              disabled={unconfirmingId === user.id}
              on:click={() => unconfirmUser(user.id)}
            >
              {unconfirmingId === user.id ? "Updating..." : "Unconfirm"}
            </button>
          </div>
        </article>
      {/each}
    </section>
  {/if}
</main>
