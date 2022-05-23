
<script>
  export let opened = false
  export let highlighted = false
  export let level = 0

  import { slide, fly } from 'svelte/transition'
  import Icon from 'svelte-awesome'
  import caretRight from 'svelte-awesome/icons/caret-right'
  import caretDown from 'svelte-awesome/icons/caret-down'

  function toggle(e) {
    console.log(level)
    console.log('got toggle', e)
    e.stopPropagation()
    opened = !opened
  }

</script>

<!-- Using short duration on out transition to prevent a stutter when the tree disapears -->
<li on:click={toggle} style="padding-left: {level ? 1.5 : 0}rem;" in:slide out:slide="{{ duration: 1 }}">
  <div style="display: flex;">
    <div style="width: 1.5rem;">
      {#if $$slots.children}
        <Icon data={opened ? caretDown : caretRight} />
      {/if}
    </div>
    <slot name="label"></slot>
  </div>
  {#if opened}
    <ul>
      <slot name="children"></slot>
    </ul>
  {/if}
</li>
