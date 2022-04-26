<script>
  let name = 'world'
  let newName = ''
 
  function handleClick(event) {
    let temp = eval(newName)
    // let x = temp()
    console.log(temp(), name, newName)
  }
</script>

<input bind:value={newName}>
<button id="a-button" on:click={handleClick} class="button">Update</button>
<h1>Hello {name}!</h1>