<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import type { DashboardOut } from "../lib/types";
  import { getApiErrorMessage } from "../lib/errors";
  import { authStore, clearToken, setAuthNotice } from "../stores/auth";

  let loading = true;
  let error: string | null = null;
  let summary: DashboardOut | null = null;

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

  const loadDashboard = async () => {
    loading = true;
    error = null;

    try {
      const token = $authStore.token;
      const headers = new Headers();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch(`${API_BASE_URL}/me/dashboard`, { headers });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (response.status === 401) {
        setAuthNotice("Authentication failed. Please sign in again.");
        clearToken();
        push("/login");
        return;
      }

      if (!response.ok) {
        throw {
          status: response.status,
          detail:
            payload?.detail ||
            payload?.message ||
            response.statusText ||
            "Load failed.",
        };
      }

      summary = payload as DashboardOut;
    } catch (err) {
      const detail =
        typeof err === "object" && err !== null && "detail" in err
          ? (err as { detail?: unknown }).detail
          : null;
      if (typeof detail === "string" && detail) {
        error = detail;
        return;
      }

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

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString();

  const formatItemsCount = (count: number) =>
    `(${count} ${count === 1 ? "item" : "items"})`;

  onMount(loadDashboard);
</script>

<main>
  <header class="page-header">
    <div>
      <h1>Chopin list</h1>
    </div>
    <div class="nav-links">
      <button class="button secondary" on:click={logout}>Sign out</button>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading dashboard...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if summary}
    <section class="dashboard-grid">
      <a class="card stack dashboard-link-card" href="#/lists" aria-label="Open lists">
        <h2>Lists</h2>
        <p class="dashboard-value">{summary.list_count}</p>
      </a>

      <a
        class="card stack dashboard-link-card"
        href="#/templates"
        aria-label="Open templates"
      >
        <h2>Templates</h2>
        <p class="dashboard-value">{summary.templates_count}</p>
      </a>
    </section>

    {#if summary.last_created_lists.length > 0}
      <section class="card stack">
        <div class="row">
          <div>
            <h2>Latest lists</h2>
          </div>
        </div>

        <div class="list-grid">
          {#each summary.last_created_lists as list}
            <a class="card dashboard-recent-link" href={`#/lists/${list.id}`}>
              <div class="dashboard-recent-main">
                <h3>{list.name} {formatItemsCount(list.items_count)}</h3>
                <p class="meta">Created {formatDate(list.created_at)}</p>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    {#if summary.last_created_templates.length > 0}
      <section class="card stack">
        <div class="row">
          <div>
            <h2>Latest templates</h2>
          </div>
        </div>

        <div class="list-grid">
          {#each summary.last_created_templates as template}
            <a class="card dashboard-recent-link" href={`#/templates/${template.id}`}>
              <div class="dashboard-recent-main">
                <h3>{template.name} {formatItemsCount(template.items_count)}</h3>
                <p class="meta">Created {formatDate(template.created_at)}</p>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</main>
