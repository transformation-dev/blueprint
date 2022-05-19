<script>
  
  import RecursiveTreeNode from './RecursiveTreeNode.svelte'

  export let tree
  export let handleNodeChosen  // Using a callback because the event approach was ugly with the recursion 
  export let chosenBreadcrumbsArray

  let searchString = ''

  function highlightSearchText(node, searchString) {
    if (searchString.length === 0 || node.alreadyHighlighted) return
    node.label = node.label.replace(new RegExp(searchString, 'gi'), '<strong>$&</strong>')
    node.alreadyHighlighted = true
  }
  
  function showNodeAndAncestors(node) {
    node.show = true
    if (node.parents) {
      for (let parent of node.parents) {
        showNodeAndAncestors(parent)
      }
    }
  }

  function highlightNode(node) {
    foundCount++
    node.highlight = true
    highlightSearchText(node, searchString)
    showNodeAndAncestors(node)
  }

  function markTree(tree, searchString) {
    for (const node of tree) {
      if (searchString?.length > 0 && node.label.toLowerCase().includes(searchString)) highlightNode(node)  // TODO: Allow specification of multiple fields to search
      if (node.children && node.children.length > 0) {
        markTree(node.children, searchString)
      }
    }
  }

  function stitchParents(tree, parent = null) { // TODO: Upgrade this to work with a DAG
    for (const node of tree) {
      if (parent) {
        if (node.parents) {
          node.parents.push(parent)
        } else {
          node.parents = [parent]
        }
      }
      if (node.children) stitchParents(node.children, node)
    }    
  }

  let treeCopy
  let preparedTree
  let showAll = true
  let openAllShown = true
  let foundCount = Infinity
  $: {
    foundCount = 0
    showAll = (! searchString || searchString.length === 0)
    console.log(JSON.stringify(tree, null, 2))
    treeCopy = structuredClone(tree)  // Works with circular references which means it should also work with a DAG
    stitchParents(treeCopy, null)
    markTree(treeCopy, searchString)
    openAllShown = foundCount < 40
    preparedTree = treeCopy
  }

</script>

<div class='page'>

  <!-- <Searchbar
    placeholder="Search"
    clearButton={true}
    customSearch={true}
    disableButton={false}
    on:searchbarSearch={(e) => {
      searchString = e.detail[1].toLowerCase()  // TODO: Need to actually show it as lowercase or allow the user to decide
    }}
    style="width: 100%; margin-top: 0px; margin-left: 0px;"
  >
    <div hidden={chosenBreadcrumbsArray.length === 0} slot="inner-end">
      <Link 
        on:click={() => {handleNodeChosen(chosenBreadcrumbsArray)}} 
        iconIos="f7:chevron_left" iconAurora="f7:chevron_left" iconMd="material:chevron_left" 
    />
    </div>
  </Searchbar> -->

    <h1>Search</h1>
    <ul>
      <!-- Using a callback because an event is ugly with the recursion, and a store only updates if the user selects a different node  -->
      <RecursiveTreeNode
        tree={preparedTree}
        showAll={showAll}
        openAllShown={openAllShown}
        handleNodeChosen={handleNodeChosen}
        chosenBreadcrumbsArray={chosenBreadcrumbsArray}
      />
    </ul>
  <!-- </Block> -->
  </div>

