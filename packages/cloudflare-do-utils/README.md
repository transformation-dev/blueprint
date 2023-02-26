# `@transformation-dev/cloudflare-do-utils`
_Utilities for interacting with Cloudflare's Durable Objects_

You wouldn't be here if you didn't already understand that there is a lot to love about Cloudflare's Durable Objects. However, it's not just a better implementation of an existing thing like serverless functions or a database. It's a completely new paradigm.

The closest thing to this we've ever seen before are JavaScript stored procedures running inside Azure's CosmosDB. I was awarded an Azure Advisor and Microsoft MVP for my contributions to the CosmosDB community, so I've been drifting this direction for some time now but Cloudflare's Durable Objects are a whole new level.

When a new paradigm like this comes along, it takes a while for the community to figure out the best ways to effectively take advantage of it. This package is my contribution to accelerating that progress. 

**WARNING and REQUEST**: I've learned a lot about cloud native architectures as well as coaching a community of developers since my Azure CosmosDB days, but I still have a lot to learn about Durable Objects. I've completely refactored my entire approach several times and I'm sure we'll find even better ways to do things as more people try out what I'm sharing here. I'm asking for your input in the form of objections, suggestions, and especially pull requests.

Follow my [publication on Cloudflare Durable Objects Design Patterns](https://medium.com/cloudflare-durable-objects-design-patterns) to stay updated as I add documentation or functionality to this project.

## Installation

```bash
npm i @transformation-dev/cloudflare-do-utils
```

## `TransactionalDOWrapperBase`

Read about the [TransactionalDOWrapperBase](https://medium.com/cloudflare-durable-objects-design-patterns/maintaining-consistent-state-56f5bb22dba9) 
