<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import type { TemplateOut } from "../lib/types";
  import { clearToken } from "../stores/auth";

  let templates: TemplateOut[] = [];
  let loading = true;
  let error: string | null = null;
  let newName = "";
  let creating = false;
  let deletingId: string | null = null;

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString();

  const loadTemplates = async () => {
    loading = true;
    error = null;
    try {
      templates = await api.listTemplates();
    } catch (err) {
      const message = getApiErrorMessage(err, "Load failed.");
      if (message) {
        error = message;
      }
    } finally {
      loading = false;
    }
  };

  const createTemplate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    creating = true;
    error = null;
    try {
      const created = await api.createTemplate({ name, items: [] });
      const { items, ...templateSummary } = created;
      templates = [templateSummary, ...templates];
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

  const deleteTemplate = async (templateId: string) => {
    if (deletingId) return;
    if (!window.confirm("Delete this template?")) return;
    deletingId = templateId;
    error = null;
    try {
      await api.deleteTemplate(templateId);
      templates = templates.filter((template) => template.id !== templateId);
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

  onMount(loadTemplates);
</script>

<main>
  <header class="page-header">
    <div>
      <h1>Templates</h1>
      <p>Reuse your favorite set of items.</p>
    </div>
    <div class="nav-links">
      <button class="button ghost" on:click={() => push("/dashboard")}>
        Dashboard
      </button>
      <button class="button ghost" on:click={() => push("/lists")}>Lists</button>
      <button class="button secondary" on:click={logout}>Sign out</button>
    </div>
  </header>

  <section class="card stack">
    <div class="toolbar">
      <input
        class="input"
        placeholder="New template name"
        bind:value={newName}
      />
      <button class="button" disabled={creating} on:click={createTemplate}>
        {creating ? "Creating..." : "Create template"}
      </button>
    </div>
  </section>

  {#if loading}
    <p class="meta">Loading templates...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if templates.length === 0}
    <section class="card">
      <h2>No templates yet</h2>
      <p>Build a template to speed up list creation.</p>
    </section>
  {:else}
    <section class="list-grid">
      {#each templates as template}
        <article class="card item-row">
          <div>
            <h2>{template.name}</h2>
            <p class="meta">Updated {formatDate(template.updated_at)}</p>
          </div>
          <div class="toolbar">
            <button
              class="button icon-button"
              aria-label="Open"
              title="Open"
              on:click={() => push(`/templates/${template.id}`)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z" />
                <path d="M5 5h6v2H7v10h10v-4h2v6H5V5z" />
              </svg>
            </button>
            <button
              class="button danger icon-button"
              aria-label="Delete"
              title="Delete"
              disabled={deletingId === template.id}
              on:click={() => deleteTemplate(template.id)}
            >
              {#if deletingId === template.id}
                ...
              {:else}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9zM6 21h12l1-14H5l1 14z"
                  />
                </svg>
              {/if}
            </button>
          </div>
        </article>
      {/each}
    </section>
  {/if}
</main>
