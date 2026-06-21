<script lang="ts">
  import { createEventDispatcher } from "svelte";

  // Controlled confirm dialog. The parent owns `open` and the pending target;
  // this component renders the shared modal chrome and emits confirm/cancel.
  // Mirrors the hand-rolled inline modal pattern used elsewhere (.modal-backdrop
  // > .modal.card.stack, role="dialog", ghost Cancel + danger confirm) so we
  // converge the native window.confirm() holdouts without a modal framework.
  export let open = false;
  export let title: string;
  export let message = "";
  export let confirmLabel = "Confirm";
  export let cancelLabel = "Cancel";
  export let busyLabel = "Working...";
  export let busy = false;
  export let danger = true;

  const dispatch = createEventDispatcher<{ confirm: void; cancel: void }>();

  const cancel = () => {
    if (busy) return;
    dispatch("cancel");
  };

  const confirm = () => {
    if (busy) return;
    dispatch("confirm");
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (!open) return;
    if (event.key === "Escape") cancel();
  };
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <div class="modal-backdrop" role="presentation" on:click|self={cancel}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <h3 id="confirm-dialog-title">{title}</h3>
      {#if message}
        <p class="meta">{message}</p>
      {/if}
      <slot />
      <div class="toolbar">
        <button class="button ghost" disabled={busy} on:click={cancel}>
          {cancelLabel}
        </button>
        <button class="button" class:danger disabled={busy} on:click={confirm}>
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </section>
  </div>
{/if}
