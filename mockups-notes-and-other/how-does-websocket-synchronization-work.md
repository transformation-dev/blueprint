# How does the websocket-synchronizable Temporalizable system work?

## Server-side

### Temporalizable DO
A durable object Class similar to TemporalEntity but designed for synchronization over websockets

  - It has these methods:
    - `post`
    - `get` - If an `ifModifiedSince` header is provided, it will of course return a 304 if the entity has not changed since that time as expected. However, it returns the diff from that time if that value in `ifModifiedSince` exactly matches an old snapshot. Failing that, it will reluctantly return the entire value and meta.
    - `patch` - Must include `ifUnmodifiedSince` header. If it's not the latest, Temporalizable will determine if the diff is in conflict with other changes from that point. If not, the change will go forward. Otherwise, it will error and return the diff from version indicated by `ifUnmodifiedSince` if that matches an old snapshot. Failing all that, it will return a different error code and the entire value and meta.
    - `delete`
    - `undelete`
  - `put` is not needed because we want to use `patch`. If the downstream consumers don't have the latest, they will have to build it from either the response from `patchDiff` or `get`.
  - I'm not sure we even need a `fetch` method. Maybe to immediately upgrade to websocket. Maybe for initial DO creation?
  - We'll still use HTTP conventions where convenient. Notice how most of the methods are HTTP methods. However, we'll encode things like headers and status codes in the serialized message
  - It implements VersioningTransactionalDOWrapper-like functionality but without the overhead of preserving the original DOs behavior
  - It maintains a list of SessionIDs as subscribers. Note, the same user can be logged in on two machines or two browsers. This allows the subscriptions to be different. Each browser gets its own unique session
  - It sends changes downstream whenever `this.value` or `this.meta` changes. `this.current` is no longer used. Downstream headed messages contain a `diff` and a `meta` field. The meta indicates the validFrom which should match the downstream latest timestamp before applying the diff. If a downstream receipient receives a diff that doesn't match their latest, they will have to initiate a round trip `get` to become current.
  - It tries to save the value under a single DO storage key but if that fails, it uses cbor-x to create an ArrayBuffer and then uses view windows on that ArrayBuffer to save it in chunks. A field in meta will indicate if the value is saved in chunks. Meta is always saved normally.
  - Maintains a websocket connection to each Session that has a subscription
  - Uses the new websocket hibernation feature to keep the connection alive even when its ejected from memory

### Org DO

  - A subclass of Temporalizable DO with some extra stuff
  - Validates that its DAG(s) are valid DAG(s) after processing a change using the diff format. This will prevent someone who talks to it directly from corrupting it, although we should try to prevent talking to it directly.
  - The Org does not maintain a list of all associated Persons. That is maintained in KV because it's the starting point right after login and could go to one of many Orgs.
  - However, it manages all permissions which are cross-references between Org nodes and Persons
  - This ACL data is stored in a denormalized fashion in the Org DO, meaning that if there is an attempt to add say read permission for a Person and they already have Read permission on an ancestor, it won't record the extra permission
  - When someone goes to remove a permission, the UI should prompt to see if they would rather move it to a lower level if this is the Person's only permission 
  - When requested by a Session DO, it'll generate an expanded/denormalized ACL that is convenient for the Session DO to use. It'll be bigger than the denormalized ACL, but smaller than the denormalized ACL plus the tree.
   
### Person DO

  - A subclass of Temporalizable DO maybe with some extra stuff like converting all email addresses to lower case. IDEA: DECLARATIVELY SPECIFY TRANSFORMATIONS LIKE THAT IN THE SCHEMA
  - A Person can belong to more than one Org
 
### Session DO
  - Serves as a proxy for all websocket communcation
  - There is a 1:1 relationship between a Session DO and a SharedWorker
  - Downstream to a single browser:
    - Maintains a websocket connection to a unique browser. It will use the new websocket hibernation feature to keep the connection alive even when its ejected from memory.
    - From a single browser, a person can only be logged into one Org. 
    - If a user is logged in on two browsers, it will have two Session DOs and they can be to different Orgs.
    - It listens on the websocket for changes coming from downstream and proxies them up to the appropriate upstream durable object
    - We keep sessions here rather than in KV but we still need KV to find the right Person DO to connect to
    - When the session is instantiated, an "alarm" is created for the moment when the session will expire. The alarm() handler simply calls `logout()`
    - `logout()` uses deleteAll to effectvely delete the session
    - The cookie will remain on the user's machine but the next time they go to use it, it will indicate that the session has expired and they will need to login again
    - A user can reconnect to the same session whose IDString was stored in a cookie as long as the session has not been deleted as indicated by the fact that it still has something (maybe entityMeta) in its storage
    - Downstream message processing:
      - If the age of the ACL is greater than say 30 minutes (a setting for the Org that is cached by the session at login), it will await an update of the ACL before proceeding
      - If the age of the ACL is greater than say 5 minutes (another cached Org setting), it'll ask for an update of the ACL but still proceed
      - If the age of the ACL is less than say 5 minutes, it'll proceed
      - Before a message from upstream is forwarded downstream, it confirms that the ACL is recent. If not, it checks to see that an update is pending. If not, it sends one. In both cases, it awaits the reply before proceeding.
      - All downstream messages (replies or updates) are checked against a current ACL.
  - Upstream to entities:
    - Maintains a connection to each upstream entity DO
    - Processes unsubscribe messsages by closing the connection which will trigger the upstream DO to remove this session from its subscriber list
    - When a request comes in, it checks that the ACL for this Person and Org is recent. If not, it sends a request to the Org to send an updated ACL.


## Client-side

### SharedWorker
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


## Simulating request-response behavior over websockets

- Browser code creates a random id for each request
- This is sent along with the request
- At the same time, the browser code creates a broadcast channel with the same name as the request id
- When the response comes in, it'll go over that broadcast channel to the tab; the tab will process the message; and close the channel

## Routing of messages

- Messages are in an envelope
- As requests move upstream, the route field in the envelope is appended
- By the time it reaches an entity, an envelope might look like this 
    ```javascript
    {
      to: [{ id: "E1", type: "entity durable object" }],
      from: { id: "1234", type: "request" },
      // via is probably not needed for upstream messages
      route: [
        { id: "T1", type: "tab", version: "0.0.10", when: "2023-01-01T00:00:00.000Z" },
        { id: "upstream", type: "broadcast channel", when: "2023-01-01T00:00:00.001Z" },
        { id: "SW1", type: "shared worker", version: "0.0.10", when: "2023-01-01T00:00:00.002Z" },
        { id: "S1", type: "session durable object", version: "0.0.10", when: "2023-01-01T00:00:00.007Z" },
        // missing `{ id: "E1", type: "entity durable object" }` because it's the destination
      ]
    }
    ```
- The response might arrive back at the original sending tab with an envelope like this:
    ```javascript
    {
      to: [{ id: "1234", type: "request" }],  // populated from the original `from` field
      from: { id: "E1", type: "entity durable object" },
      via: [{ id: "S1", type: "session durable object" }],
      route: [
        { id: "E1", type: "entity durable object", version: "0.0.10", when: "2023-01-01T00:00:00.011Z" },
        { id: "S1", type: "session durable object", version: "0.0.10", when: "2023-01-01T00:00:00.013Z" },
        { id: "SW1", type: "shared worker", version: "0.0.10", when: "2023-01-01T00:00:00.023Z" },
        { id: "1234", type: "broadcast channel", when: "2023-01-01T00:00:00.024Z" },
      ]
    }
    ```
