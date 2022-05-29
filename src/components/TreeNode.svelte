
<script>

  export let node  // a TreeNode
  export let isRoot = false
  export let handleNodeChosen  // Using a callback because the event approach was ugly with the recursion 
  export let chosenBreadcrumbsArray
  export let parentBreadcrumbsArray = []
  export let expanded = true

  import { slide } from 'svelte/transition'
  import Icon from 'svelte-awesome'
  import caretRight from 'svelte-awesome/icons/caret-right'
  import caretDown from 'svelte-awesome/icons/caret-down'

  function toggle(e, node) {
    e.stopPropagation()
    expanded = !expanded
    node.expanded = !node.expanded
  }

  function clickTreeNode(e, node) {
    handleNodeChosen(getNewBreadcrumbsArray(parentBreadcrumbsArray, node))
  }

  function getNewBreadcrumbsArray(breadcrumbsArray, node) {
    const newArray = [...breadcrumbsArray]
    newArray.push(node)
    return newArray
  }

  function breadcrumbsEqual(a, b) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id) return false
    }
    return true
  }

</script>


{#if !isRoot}
  <div class="flex">
    <div on:click={(e) => toggle(e, node)} style="width: 1.5rem;">
      {#if node.children?.length > 0}
        <Icon data={expanded ? caretRight : caretDown} />
      {/if}
    </div>
    <div on:click={(e) => clickTreeNode(e, node)}>
      <div class:chosen={breadcrumbsEqual(chosenBreadcrumbsArray, getNewBreadcrumbsArray(parentBreadcrumbsArray, node))} >
        {@html node.labelHighlighted || node.label}
      </div>
    </div>
  </div>
{/if}

{#if (node.expanded) && node.children}
  <ul>
    {#each node.children as child}
      <!-- No out to prevent a stutter when the tree collapses -->
      <li style="padding-left: {isRoot ? 0 : 1.5}rem;" in:slide>
        <svelte:self 
          node={child}         
          handleNodeChosen={handleNodeChosen}
          chosenBreadcrumbsArray={chosenBreadcrumbsArray}
          parentBreadcrumbsArray = {getNewBreadcrumbsArray(parentBreadcrumbsArray, node)}
          expanded={node.expanded}
        />
      </li>
    {/each}
  </ul>
{/if}


<style>

  .chosen {
    color: var(--agnostic-primary-hover);
  }

</style>
