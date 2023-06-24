# How does the websocket-synchronizable temporal entity system work?

## General concept

The system has the following moving parts:

1. Temporalizable DO. A new durable object Class similar to TemporalEntity but designed for synchronization.
   1. It has these methods:
      1. `post`
      2. `get` - If an `ifModifiedSince` header is provided, it will of course return a 304 if the entity has not changed since that time as expected. However, it returns the diff from that time if that value in `ifModifiedSince` exactly matches an old snapshot. Failing that, it will reluctantly return the entire value and meta.
      3. `patchDiff` - Must include `ifUnmodifiedSince` header. If it's not the latest, Temporalizable will determine if the diff is in conflict with other changes from that point. If not, the change will go forward. Otherwise, it will error and return the diff from version indicated by `ifUnmodifiedSince` if that matches an old snapshot. Failing all that, it will return a different error code and the entire value and meta.
      4. `delete`
      5. `patchUndelete`
   2. `put` is not needed because we want to use `patchDiff`. If the downstream consumers don't have the latest, they will have to build it from either the response from `patchDiff` or `get`.
   3. Its `fetch` method only accepts POSTs and the contents of the post are merely the websocket message. Similarly, its responses are not designed to use all the normal HTTP mechanisms. They are designed to go over the websocket connection. It still uses some HTTP conventions because they are convenient and well understood. However, things like headers and error codes are simply fields in the serialized message.
   4. It will implement VersioningTransactionalDOWrapper-like functionality but without the overhead of preserving the original DOs behavior.
   5. It will maintain a list of subscriber personIDs.
   6. It will periodically send a ping to the subscribers via the Person proxy and remove any subscribers that don't respond in time.
   7. It will send changes downstream whenever `this.value` or `this.meta` changes. `this.current` is no longer used. Responses will contain a `diff` and a `meta` field. `this.value` is not sent. If a downstream receipient receives a diff that doesn't match their latest, they will have to initiate a round trip `get` to become current.
   8. It will try to save the value under a single key but if that fails, it will use cbor-x to create an ArrayBuffer and use view windows to save that in chunks. A field in meta will indicate if the value is saved in chunks.
   
2. Person DO:
   1. A subclass of Temporalizable that knows to send changes to its own values (e.g. person's name, email addresses, etc.) locally
   2. It maintains a websocket connection to shared worker(s) - one per unique browser that Person is logged in from. It will use the new websocket hibernation feature to keep the connection alive even when its ejected from memory.
   3. It listens on the websocket for changes coming from downstream and proxies them up to the appropriate upstream durable object
   4. This "upstream" DO might be itself in the case of changes to its own values (e.g. name, email addresses, etc.)
   
3. Org DO:

------

GOING BACK TO THE BROADCAST CHANNEL IDEA

------

1. Shared worker:
   1. It establishes the websocket connection to the Person durable object on login or reconnection using stored cookie credentials
   2. It maintains the full meta and value of all client side data and serves as the backend for all local stores.
   3. When a change comes in over the websocket connection (aka from upstream), it pushes it onto the broadcast channel with the name matching the entity id.
   4. It relies upon the native serialization for communication on the broadcast channel
   5. It uses cbor-x with structured clone extension serialization for communication on the websocket
   6. It will also listen on the `upstream` broadcast channel for changes from the stores, calculate the diff, and push it onto the upstream websocket.
   
2.  Custom store:
    1. It maintains the latest value and meta but doesn't keep all the old snapshots
    2. If changes come from the user, it translates those into patchDiff form and pushes them onto the broadcast channel which means the shared worker and other tabs will get them.
    3. It listens for messages in patchDiff form from the broadcast channel and makes appropriate changes to the local state.
    4. For now, it implements the Svelte custom store interface but later it can be generalized to any state management system

### How do subscriptions stay current?

We can't rely upon the `destroy()`/`unsubscribe()` behavior of the components and stores unless we keep track of unique browser tabs. So, there is an `ack` broadcast channel that the shared worker listens on. Every downstream state update is tracked by the shared worker. If no ack comes back within a certain time, the shared worker will assume that there is no local store for that entity id and it will send an unsubscribe message upstream. This means that any downstream message from an entity DO will result in a cleanup of its subscriber list. No need for periodic ping-pong. The subscriber list may include stale subscribers but that will only be a problem if the DO is active which is exactly when it'll get cleaned up.
