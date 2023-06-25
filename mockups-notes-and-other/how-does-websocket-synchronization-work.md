# How does the websocket-synchronizable temporal entity system work?

## Server-side

### Temporalizable DO
A new durable object Class similar to TemporalEntity but designed for synchronization.

  - It has these methods:
    - `post`
    - `get` - If an `ifModifiedSince` header is provided, it will of course return a 304 if the entity has not changed since that time as expected. However, it returns the diff from that time if that value in `ifModifiedSince` exactly matches an old snapshot. Failing that, it will reluctantly return the entire value and meta.
    - `patchDiff` - Must include `ifUnmodifiedSince` header. If it's not the latest, Temporalizable will determine if the diff is in conflict with other changes from that point. If not, the change will go forward. Otherwise, it will error and return the diff from version indicated by `ifUnmodifiedSince` if that matches an old snapshot. Failing all that, it will return a different error code and the entire value and meta.
    - `delete`
    - `patchUndelete`
  - `put` is not needed because we want to use `patchDiff`. If the downstream consumers don't have the latest, they will have to build it from either the response from `patchDiff` or `get`.
  - Its `fetch` method only accepts POSTs and the contents of the post are merely the websocket message. Similarly, its responses are not designed to use all the normal HTTP mechanisms. They are designed to go over the websocket connection. It still uses some HTTP conventions because they are convenient and well understood. However, things like headers and error codes are simply fields in the serialized message.
  - It will implement VersioningTransactionalDOWrapper-like functionality but without the overhead of preserving the original DOs behavior.
  - It will maintain a list of subscriber personIDs.
  - It will send changes downstream whenever `this.value` or `this.meta` changes. `this.current` is no longer used. Responses will contain a `diff` and a `meta` field. `this.value` is not sent. If a downstream receipient receives a diff that doesn't match their latest, they will have to initiate a round trip `get` to become current.
  - It will try to save the value under a single key but if that fails, it will use cbor-x to create an ArrayBuffer and use view windows to save that in chunks. A field in meta will indicate if the value is saved in chunks.
   
### Person DO

  - A subclass of Temporalizable DO with some extra stuff
  - It maintains a websocket connection to shared worker(s) - one per unique browser that Person is logged in from. It will use the new websocket hibernation feature to keep the connection alive even when its ejected from memory.
  - It listens on the websocket for changes coming from downstream and proxies them up to the appropriate upstream durable object
  - This "upstream" DO might be itself in the case of changes to its own values (e.g. name, email addresses, etc.)
  - We keep sessions here rather than in KV but we still need KV to find the right Person DO to connect to

### Org DO

  - A subclass of Temporalizable DO with some extra stuff
  - Validates that its DAG(s) are valid DAG(s) after processing a change using the diff format. This will prevent someone who talks to it directly from corrupting it, although we should try to prevent that.
  - The Org does not maintain a list of all associated Persons. That is maintained in KV because it's the starting point right after login and could go to one of many Orgs.
  - However, it manages all permissions which are cross-references between Org nodes and Persons.


## Client-side

### Shared worker
  - It establishes the websocket connection to the Person durable object on login or reconnection using stored cookie credentials
  - It creates a shared worker class (SWC, see below) instance for each enityID with an active subscription
  - When a change comes in over the websocket connection (aka from upstream), it sends that to the appropriate SWC
  - The SWC will process the change and respond with the simple format expected by the store
  - The shared worker will then push that over the broadcast channel for that entityID
  - It relies upon the native serialization for communication on the broadcast channel
  - It uses cbor-x with structured clone extension serialization for communication on the websocket
  - It listens on the `upstream` broadcast channel for messages from the stores that represent method calls on SWC instances. The simplest method call is a full update of the value. However, it will also support other methods like the specialized ones in Tree that will be ported to DAGTree.
  - It then does several things:
    - It sends the message (aka serialized method call) to the SWC and waits for the response. 
    - If that response indicates that the value changed, it will include both the new value and the diff and timestamp needed for the `ifUnmodifiedSince` "header". It will then do two things
      - Push the new value down to all subscribed tabs. Note, after the roundtrip to the server, the value may change again. In that case, the normal downstream behavior will update all subscribed tabs, however, by sending this optimistically to all tabs, the UI will be snappy.
      - Send the diff upstream for processing
    - It will then respond to the originating tab with the result of method call success or error using the mechanism described below

### Shared worker classes (SWCs)

These are classes that are instantiated by the shared worker to provide local convenience methods for manipulating the value

The shared worker classes (SWC) translates between downstream and upstream storage formats. Upstream would always be value and meta. Downstream could be whatever is most convenient for the UI.

The store proxies the methods of the SWC so client code can call them on the store instance. In reality, it just sends a message containing the method call up to the SWC via the shared worker.

For example, the DAGTree SWC would include almost all of the functionality that is currently in the Tree DO. Note, we should still have the server-side for DAGTree confirm that the value is valid including running our currently unused DAG checker.

The biggest complexity associated with this approach is that there isn't a way to do round-trip request-response across browser contexts. However, we can simulate that. We create a new broadcast channel for each request with a random GUID as the name. Then add listeners `channel.onmessage` and `channel.onmessageerror` while also creating a timeout for it. When any one of those three things is triggered, we take the necessary action and clean up the listeners with a call to `channel.close()`. When we send the response from the SWC side, we also call `BroadcastChannel.close()` which will allow it to be garbage collected.

### DAGTree SWC

  - The state in the current Tree DO is maintained in separate `this.nodes`, and `this.edges` members. I'll have to move them into a single object `this.value = { nodes, edges }` member. This will allow it to work with the diffing and patching of Temporalizable.
  - Right now, edges use an array like this `{ <id: string>: [<id: string>] }`. I must change it to `{ <id: string>: { <id: string>: true } }` to make the diffs be readable when debugging. Otherwise, they'll be an inscrutible numeric index.
  - `tree` is derived as needed. The heavy lifting of this SWC is to translate between the upstream format of `{ value, meta }` and the `tree` format that is used by the tree control. That code is mostly working in the current Tree DO with the only bit remaining being the population of orphaned. I'll have to move that code into this SWC.
   
### Store

  - It doesn't maintain local state. It gets it from the SWCs via the shared worker in the form of a single value
  - If a change comes from the user, it pushes it onto the `upstream` broadcast channel which means the shared worker will get it
  - It also listens on the channel whose name is the entityID for changes that come from upstream.
  - For now, it implements the Svelte custom store interface but later it can be generalized to any state management system

### How do subscriptions stay current?

To keep subscriptions current, we take advantage of the `onDestroy`/`unsubscribe()` behavior of the components and stores. When each browser tab first loads, it generates a tabGUID. When the tab subscribes to any entityID it includes this tabGUID. The shared worker keeps track of these local subscriptions with this data structure `{ entityID: { swc, subscribers: { tabGUID: true } }`

Stores send a message on the `unsubscribe` broadcast channel when they are destroyed. The shared worker will listen on that channel, and remove that tab from the subscribers list for that entityID. If the list of subscribed tabs is now empty, it'll delete its own copy of the entity, and send an unsubscribe message over the websocket. The upstream DO will remove the Person from its subscriber list.

To make the above work, our store returns an `unsubscribe()` function when `subscribe()` is called. If you use $-prefixed variables, Svelte will automatically call `unsubscribe()` when the component is destroyed. If you use `subscribe()` directly as we will for frameworks other than Svelte, you must call `unsubscribe()` directly in the equivalent of Svelte's `onDestroy` lifecycle event.

In case the `onDestroy`/`unsubscribe()` behavior of the components and stores fails to always unsubscribe resulting in slow memory leaks, we can later also add an ack feature. We'll us an `ack` broadcast channel that the shared worker listens on. Every downstream state update is tracked by the shared worker. If no ack comes back from any store within a certain time, the shared worker will assume that there is no local store for that entity id, it will cleanup its own copy, and send an unsubscribe message upstream. This means that any downstream message from an entity DO will result in a cleanup of its subscriber list. No need for periodic ping-pong. The subscriber list may include stale subscribers but that will only be a problem if the DO is active which is exactly when it'll get cleaned up.

### Right now, Tree creates the Node DOs. With a generic backend, what creates them?

We could still have our server-side DAGTree DO do that, but I'm thinking that might have been a mistake. Rather, we allow clients to create them directly. When they hear back that the creation was successful, they can add them to the tree. We can also use the DO timer feature to delete any DOs that don't get connected to a tree or some other attachment place within a given time period. This means, the base Temporalizable class must maintain a placesAttachedTo object. Only when that is empty is the DO hard deleted.
