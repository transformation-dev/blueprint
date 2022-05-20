
<script>
  export let opened = false
  export let selected = false
  export let level = 0

  import { slide } from 'svelte/transition'
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

<li on:click={toggle} style="padding-left: {level ? 1.5 : 0}rem;" transition:slide>
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
