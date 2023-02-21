# `@transformation-dev/cloudflare-do-utils`
_Utilities for interacting with Cloudflare's Durable Objects_

You wouldn't be here if you didn't already understand that there is a lot to love about Cloudflare's Durable Objects. However, it's not just a better implementation of an existing thing like serverless functions or a database. It's a completely new paradigm.

The closest thing to this we've ever seen before are JavaScript stored procedures running inside Azure's CosmosDB. I was awarded an Azure Advisor and Microsoft MVP for my contributions to the CosmosDB community, so I've been drifting this direction for some time now but Cloudflare's Durable Objects are a whole new level.

When a new paradigm like this comes along, it takes a while for the community to figure out the best ways to effectively take advantage of it. This package is my contribution to accelerating that progress. 

**WARNING and REQUEST**: I've learned a lot about cloud native architectures as well as coaching a community of developers since my Azure CosmosDB days, but I still have a lot to learn about Durable Objects. I've completely refactored my entire approach several times and I'm sure we'll find even better ways to do things as more people try out what I'm sharing here. I'm asking for your input in the form of objections, suggestions, and especially pull requests.

## Installation

```bash
npm i @transformation-dev/cloudflare-do-utils
```

## `TransactionalDOWrapperBase`

This is what the Durable Object Runtime API Documentation says about transactions:

> Explicit transactions are no longer necessary. Any series of write operations with no intervening await will automatically be submitted atomically, and the system will prevent concurrent events from executing while awaiting a read operation (unless you use allowConcurrency: true). Therefore, a series of reads followed by a series of writes (with no other intervening I/O) are automatically atomic and behave like a transaction.

Reading this made me happy and I was further encouraged by this wonderful post on the Cloudflare blog by Kenton Varda: [Durable Objects: Easy, Fast, Correct — Choose three](https://blog.cloudflare.com/durable-objects-easy-fast-correct-choose-three/). 

However, as I thought about it more, I became convinced that I still had a problem. The input and output gates discussed in that post provide automatic transactional atomicity in the case of a storage operation failure. But I personally am much more likely to make a coding mistake that causes the in-memory state of my durable object to become out of sync with storage and even for storage under two different keys to no longer be self-consistent. Take a look at the fetch handler for this simple DO and see if you can spot the flaw.

```javascript
async fetch(request) {
  const url = new URL(request.url)
  if (url.search === '') {  // if there is no query string, return the current state
    return new Response(JSON.stringify({ name: this.name, greeting: this.greeting }))
  } else {  // if there is a query string, update the state
    this.name = url.searchParams.get('name')
    this.state.storage.put('name', this.name)
    this.greeting = `HELLO ${this.name.toUpperCase()}!`
    this.state.storage.put('greeting', this.greeting)
  }
}
```

Haven't spotted the problem yet? Here's a hint: What will happen if your first fetch is `http://fake.host/wrapped-do/?name=Larry` followed by `http://fake.host/wrapped-do/?nombre=Salvatore`? The first fetch goes as expected but on the second fetch `this.name` becomes `undefined` and that gets stored under the `name` key. This is because the search parameter is `nombre` instead of `name`. When you call `.toUpperCase()` on `undefined` it throws an error and the next `storage.put()` never occurs. The greeting will be out of sync with the name. The next fetch to get the current state with `http://fake.host/wrapped-do/` will respond with `{ name: undefined, greeting: 'HELLO LARRY!' }` and the two storage keys will also be in an inconsistent state.

I know you can easily fix this problem but that's not the point. The point is that even for simple DOs and even when you test them, you cannot anticipate all inputs and states. Over time your durable object classes are likely to become more complex and your chance of making a coding error like this will go up exponentially. I considered many approaches to eleviate the problem but they overly complicated my code. 

However, with this wrapper, the above code behaves as you would have hoped. The second fetch will fail inside a transaction (those things that Cloudflares says are "no longer necessary") and the first `storage.put()` will get rolled back. The DO is evicted from memory so the later call will rehydrate from storage and return the self-consistent response of `{ name: 'Larry', greeting: 'HELLO LARRY!' }`.

You can write your DOs exactly the same as without this wrapper and it will take care of making sure in-storage state is self-consistent, in-memory state is self-consistent, and consistency between memory and storage is also assured.

Also, code using TransactionalDOWrapperBase should be nearly as performant as an unwrapped class due to the in-memory storage cache discussed in the Cloudflare "choose three" blog post linked above. In fact, all three parts of Kenton Varda's "choose three" post are taken advantage of. Easy, fast, and now even more correct.
