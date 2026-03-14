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

  onMount(loadDashboard);
</script>

<main>
  <header class="page-header">
    <div>
      <h1>Dashboard</h1>
      <p>Quick overview of your lists and templates.</p>
    </div>
    <div class="nav-links">
      <button class="button ghost" on:click={() => push("/lists")}>Lists</button>
      <button class="button ghost" on:click={() => push("/templates")}>
        Templates
      </button>
      <button class="button secondary" on:click={logout}>Sign out</button>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading dashboard...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if summary}
    <section class="dashboard-grid">
      <article class="card stack">
        <h2>Lists</h2>
        <p class="dashboard-value">{summary.list_count}</p>
      </article>

      <article class="card stack">
        <h2>Templates</h2>
        <p class="dashboard-value">{summary.templates_count}</p>
      </article>
    </section>

    <section class="card stack">
      <div class="row">
        <div>
          <h2>Latest templates</h2>
          <p class="meta">Your five most recently created templates.</p>
        </div>
        <button class="button ghost" on:click={() => push("/templates")}>
          Open templates
        </button>
      </div>

      {#if summary.last_created_templates.length === 0}
        <p class="meta">No templates yet.</p>
      {:else}
        <div class="list-grid">
          {#each summary.last_created_templates as template}
            <article class="card item-row">
              <div>
                <h3>{template.name}</h3>
                <p class="meta">Created {formatDate(template.created_at)}</p>
              </div>
              <button class="button" on:click={() => push(`/templates/${template.id}`)}>
                Open
              </button>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</main>
