
<script>

  import { toastsStore, closeToast } from '../stores'
  import Icon from 'svelte-awesome'
  import close from 'svelte-awesome/icons/close'
  import { slide } from 'svelte/transition'

</script>


<div id="toasts" class="flex flex-column">
  {#each $toastsStore as toast}
    <div id="toast-message" transition:slide class="flex" class:warning={toast.messageType==="warning"} class:error={toast.messageType==="error"} class:success={toast.messageType==="success"}>
      <div class="flex flex-fill justify-center self-center small" class:warning={toast.messageType==="warning"} class:error={toast.messageType==="error"} class:success={toast.messageType==="success"}>
        {toast.message}
      </div>
      <button id="toast-close" on:click={(e) => closeToast(toast)} class="mie1 inherit-colors no-border">
        <Icon scale={.7} data={close} class="mis4 mie4" />
      </button>
    </div>
  {/each}
</div>


<style>

  .inherit-colors {
    background-color: inherit;
    color: inherit;
  }

  .no-border {
    border: 0px;
  }

  .small {
    font-size: small;
  }

  .warning {
    background-color: var(--agnostic-warning-light);
    color: var(--agnostic-warning-dark);
  }

  .error {
    background-color: var(--agnostic-error-light);
    color: var(--agnostic-error-dark);
  }

  .success {
    background-color: var(--agnostic-action-light);
    color: var(--agnostic-action-dark);
  }

</style>
  