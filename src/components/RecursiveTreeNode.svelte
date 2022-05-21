
<script>

  export let tree  // root is assumed to be an array
  export let showAll
  export let openAllShown
  export let handleNodeChosen  // Using a callback because the event approach was ugly with the recursion 
  export let chosenBreadcrumbsArray
  export let parentBreadcrumbsArray = []

  import TreeNode from './TreeNode.svelte'

  function clickTreeNode(e, node) {
    console.log('got clickTreeNode', node)
    // var $ = f7.$
    // if ($(e.target).is('.treeview-toggle')) return
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
        <TreeNode level={parentBreadcrumbsArray.length} highlighted={node.highlight} opened={node.show && openAllShown} onClick={(e) => clickTreeNode(e, node)}>
        
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
        <TreeNode level={parentBreadcrumbsArray.length} highlighted={node.highlight} onClick={(e) => clickTreeNode(e, node)}>
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

<!--
  <li on:click={toggle} style="padding-left:{level*1}rem" transition:slide>
    {#if !node.expanded }
      <Icon data={arrowRight} />
    {:else}
      <Icon data={arrowLeft} />
    {/if}
    {node.data}
  </li>
  
  {#if node.expanded && node.children}
      {#each node.children as child}
        <svelte:self node={child} level={level+1}/>
      {/each}
  {/if}
  
  <style>
    li {
        border-bottom: solid 1px #eee;
        margin: 0 0;
        padding: 0rem;
        background: #fafafa;
        display: flex;
    }
  </style>

-->