
<script>

  export let tree  // root is assumed to be an array
  export let showAll
  export let openAllShown
  export let handleNodeChosen  // Using a callback because the event approach was ugly with the recursion 
  export let chosenBreadcrumbsArray
  export let parentBreadcrumbsArray = []

  import TreeNode from './TreeNode.svelte'

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

<ul>
  {#each tree as node}
    {#if node.show || showAll}
      {#if node.children?.length > 0}
        <TreeNode level={parentBreadcrumbsArray.length} opened={node.show && openAllShown} onClick={(e) => clickTreeNode(e, node)}>
        
          <div slot="label"
            class:chosen={breadcrumbsEqual(chosenBreadcrumbsArray, getNewBreadcrumbsArray(parentBreadcrumbsArray, node))} 
          >
            {@html node.label}
          </div>
          <svelte:self 
            slot="children"
            tree={node.children}         
            handleNodeChosen={handleNodeChosen}
            chosenBreadcrumbsArray={chosenBreadcrumbsArray}
            showAll={showAll}
            openAllShown={openAllShown}
            parentBreadcrumbsArray = {getNewBreadcrumbsArray(parentBreadcrumbsArray, node)}
          />
        </TreeNode>
      {:else}
        <TreeNode level={parentBreadcrumbsArray.length} onClick={(e) => clickTreeNode(e, node)}>
          <div slot="label"
            class:chosen={breadcrumbsEqual(chosenBreadcrumbsArray, getNewBreadcrumbsArray(parentBreadcrumbsArray, node))} 
          >
            {@html node.label}
          </div>
        </TreeNode>
      {/if}
    {/if}
  {/each}
</ul>

<style>
  .chosen {
    color: var(--agnostic-primary-hover);
  }
</style>
