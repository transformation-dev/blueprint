
<script>
  export let opened = false
  export let selected = false
  export let level = 0

  import { slide } from 'svelte/transition'
  import Icon from 'svelte-awesome'
  import arrowRight from 'svelte-awesome/icons/arrow-right'
  import arrowDown from 'svelte-awesome/icons/arrow-down'

  function toggle(e) {
    console.log('got toggle', e)
    e.stopPropagation()
    opened = !opened
  }

</script>

<li on:click={toggle} style="padding-left:{level * 1}rem;" transition:slide>
  <div style="display: flex;">
    <Icon data={opened ? arrowDown : arrowRight} />
    <slot name="label"></slot>
  </div>
  {#if opened}
    <ul>
      <slot name="children"></slot>
    </ul>
  {/if}
</li>