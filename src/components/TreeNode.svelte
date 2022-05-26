
<script>
  export let opened = false
  export let level = 0
  export let onClick

  import { slide, fly } from 'svelte/transition'
  import Icon from 'svelte-awesome'
  import caretRight from 'svelte-awesome/icons/caret-right'
  import caretDown from 'svelte-awesome/icons/caret-down'

  function toggle(e) {
    e.stopPropagation()
    opened = !opened
  }

</script>


<!-- No out to prevent a stutter when the tree collapses -->
<li style="padding-left: {level ? 1.5 : 0}rem;" in:slide>
  <div class="flex">
    <div on:click={toggle} style="width: 1.5rem;">
      {#if $$slots.children}
        <Icon data={opened ? caretDown : caretRight} />
      {/if}
    </div>
    <div on:click={onClick}>
      <slot name="label"></slot>
    </div>
  </div>
  {#if opened}
    <ul>
      <slot name="children"></slot>
    </ul>
  {/if}
</li>
