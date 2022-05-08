<script>
  import { Disclose } from 'agnostic-svelte'

  const o = {a: {b: 10}}
  // eslint-disable-next-line ParseError
  // console.log(a?.b)
</script>

<style>
  .rotate-left {
    transform: rotate(-90deg);
  }

  .tree {
    width: 300px;
  }
</style>

<!-- Spacer -->
<div style="height: 0.5rem" />

<h1>POC</h1>
<div class="rotate-left">Something to test styles</div>

