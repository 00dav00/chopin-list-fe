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
  let createTemplateModalOpen = false;
  let deletingId: string | null = null;
  let createListModalTemplate: TemplateOut | null = null;
  let createListName = "";
  let creatingListFromTemplate = false;

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
      createTemplateModalOpen = false;
    } catch (err) {
      const message = getApiErrorMessage(err, "Create failed.");
      if (message) {
        error = message;
      }
    } finally {
      creating = false;
    }
  };

  const openCreateTemplateModal = () => {
    newName = "";
    createTemplateModalOpen = true;
  };

  const closeCreateTemplateModal = () => {
    if (creating) return;
    createTemplateModalOpen = false;
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

  const openCreateListModal = (template: TemplateOut) => {
    createListModalTemplate = template;
    createListName = "";
  };

  const closeCreateListModal = () => {
    if (creatingListFromTemplate) return;
    createListModalTemplate = null;
    createListName = "";
  };

  const createListFromTemplate = async () => {
    if (!createListModalTemplate || creatingListFromTemplate) return;
    creatingListFromTemplate = true;
    error = null;
    try {
      const created = await api.createListFromTemplate(createListModalTemplate.id, {
        name: createListName.trim() || null,
      });
      closeCreateListModal();
      push(`/lists/${created.id}`);
    } catch (err) {
      const message = getApiErrorMessage(err, "Create failed.");
      if (message) {
        error = message;
      }
    } finally {
      creatingListFromTemplate = false;
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
              class="button ghost icon-button"
              aria-label="Create list from template"
              title="Create list"
              on:click={() => openCreateListModal(template)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 20h14v-2H5v2zm7-16-5 5h3v6h4V9h3l-5-5z" />
              </svg>
            </button>
            <button
              class="button icon-button"
              aria-label="Open"
              title="Open"
              on:click={() => push(`/templates/${template.id}`)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.79 1.79 3.75 3.75 1.96-1.62z"
                />
              </svg>
            </button>
            <button
              class="button danger icon-button"
              aria-label="Delete"
              title="Delete"
              disabled={deletingId === template.id}
              on:click={() => deleteTemplate(template.id)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9zM6 21h12l1-14H5l1 14z"
                />
              </svg>
            </button>
          </div>
        </article>
      {/each}
    </section>
  {/if}

  <button class="button floating-add-item" on:click={openCreateTemplateModal}>
    Add template
  </button>
</main>

{#if createTemplateModalOpen}
  <div class="modal-backdrop" role="presentation" on:click|self={closeCreateTemplateModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-template-title"
    >
      <h3 id="create-template-title">Create template</h3>
      <input
        class="input"
        placeholder="New template name"
        bind:value={newName}
      />
      <div class="toolbar">
        <button class="button ghost" disabled={creating} on:click={closeCreateTemplateModal}>
          Cancel
        </button>
        <button class="button" disabled={creating} on:click={createTemplate}>
          {creating ? "Creating..." : "Create template"}
        </button>
      </div>
    </section>
  </div>
{/if}

{#if createListModalTemplate}
  <div class="modal-backdrop" role="presentation" on:click|self={closeCreateListModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-list-from-template-title"
    >
      <h3 id="create-list-from-template-title">Create list from template</h3>
      <p class="meta">Template: {createListModalTemplate.name}</p>
      <input
        class="input"
        placeholder="Optional list name"
        bind:value={createListName}
      />
      <div class="toolbar">
        <button
          class="button ghost"
          disabled={creatingListFromTemplate}
          on:click={closeCreateListModal}
        >
          Cancel
        </button>
        <button
          class="button"
          disabled={creatingListFromTemplate}
          on:click={createListFromTemplate}
        >
          {creatingListFromTemplate ? "Creating..." : "Create list"}
        </button>
      </div>
    </section>
  </div>
{/if}
