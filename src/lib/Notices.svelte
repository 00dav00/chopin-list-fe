<script lang="ts">
  import { onMount, tick } from "svelte";
  import { notices, dismiss, pauseTimer, resumeTimer } from "./notices";

  let container: HTMLElement;

  // Dismiss a notice. When the action came from the keyboard, move focus to
  // the next notice's close button (or the previous one if it was last), else
  // to the body — never strand focus on a removed node.
  const onDismiss = async (id: string, fromKeyboard: boolean) => {
    const index = $notices.findIndex((notice) => notice.id === id);
    dismiss(id);
    if (!fromKeyboard) return;
    await tick();
    const buttons = container?.querySelectorAll<HTMLButtonElement>(".notice-dismiss");
    if (buttons && buttons.length > 0) {
      buttons[Math.min(index, buttons.length - 1)]?.focus();
    } else {
      document.body.focus();
    }
  };

  // Esc dismisses the most-recent notice (last in the stack).
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    const current = $notices;
    if (current.length === 0) return;
    void onDismiss(current[current.length - 1].id, true);
  };

  onMount(() => {
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });
</script>

<!-- One polite live region for the whole stack; error notices additionally
     announce assertively via role="alert". Mounted once at the App root. -->
<div class="notices" bind:this={container} aria-live="polite">
  {#each $notices as notice (notice.id)}
    <div
      class="notice notice-{notice.severity}"
      role={notice.severity === "error" ? "alert" : undefined}
      on:mouseenter={() => pauseTimer(notice.id)}
      on:mouseleave={() => resumeTimer(notice.id)}
      on:focusin={() => pauseTimer(notice.id)}
      on:focusout={() => resumeTimer(notice.id)}
    >
      <span class="notice-icon" aria-hidden="true">
        {#if notice.severity === "error"}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 5h2v7h-2V7zm0 9h2v2h-2v-2z" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 1 21h22L12 2zm-1 7h2v6h-2V9zm0 8h2v2h-2v-2z" />
          </svg>
        {/if}
      </span>
      <span class="notice-message">{notice.message}</span>
      <button
        type="button"
        class="notice-dismiss"
        aria-label="Dismiss"
        on:click={(event) => onDismiss(notice.id, event.detail === 0)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 5.7 18.3 4.3 16.89 10.59 12 4.3 5.71 5.7 4.3l4.89 4.89L16.89 4.3z"
          />
        </svg>
      </button>
    </div>
  {/each}
</div>

<style>
  .notices {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    /* Clear the floating "Add item" FAB (bottom 1.5rem) so notices never
       cover it. Above page content, below modals (z 1000) and nav (z 1100+). */
    bottom: 5rem;
    z-index: 950;
    width: min(28rem, calc(100vw - 2rem));
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
  }

  .notice {
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.7rem 0.85rem;
    border-radius: 0.6rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-left-width: 4px;
    box-shadow: var(--shadow);
    color: var(--ink);
    animation: notice-in 0.18s ease;
  }

  .notice-error {
    border-left-color: #b3261e;
  }
  .notice-error .notice-icon {
    color: #b3261e;
  }
  .notice-warning {
    border-left-color: #9a6a00;
  }
  .notice-warning .notice-icon {
    color: #9a6a00;
  }

  .notice-icon {
    flex: 0 0 auto;
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 0.05rem;
  }
  .notice-icon svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }

  .notice-message {
    flex: 1 1 auto;
    line-height: 1.35;
  }

  .notice-dismiss {
    flex: 0 0 auto;
    /* >=44px touch target while the visible glyph stays small. */
    min-width: 44px;
    min-height: 44px;
    margin: -0.4rem -0.35rem -0.4rem 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    border-radius: 0.5rem;
  }
  .notice-dismiss svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: currentColor;
  }
  .notice-dismiss:hover {
    color: var(--ink);
  }
  .notice-dismiss:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @keyframes notice-in {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .notice {
      animation: none;
    }
  }
</style>
