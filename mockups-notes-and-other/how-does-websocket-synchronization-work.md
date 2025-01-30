# How does the websocket-synchronizable Temporalizable system work?

Server-side has these main components:
1. Org DO
2. Attached Data in D1
3. Aggregator DO

Client-side has these main components:
1. SharedWorker
2. Store
3. SWC (shared worker class)

## Server-side

### Org DO

  - Maintains org tree, ACL lists, sessions, and subscriptions which are stored in DO storage
  - Processes all operations on attached data which is stored in D1
  - Other than the initial connection, all communication with the client is via websockets

  #### Org DO: Org Tree, and Org ACL (access control) functionality

    - Has methods for creating, updating, and deleting Org nodes
    - The Org does not maintain a full list of all associated Persons. That is maintained elsewhere (now KV, but moving to D1) because it's the starting point right after a Person logs in and could be directed to one of many Orgs that Person is associated with.
    - However, it manages all permissions which are cross-references between Org nodes and Persons
    - This ACL data is stored in a denormalized fashion in the Org DO, meaning that if there is an attempt to add say read permission for a Person and they already has Read permission on an ancestor, it won't record the extra permission
    - When someone goes to remove a permission, the UI should prompt to see if they would rather move it to a lower level

  #### Org DO: Session and websocket functionality

    - There is a 1:1:1 relationship between a session, each unique browser (aka each SharedWorker), and a websocket connection
    - Uses the websocket hibernation feature to keep the connection alive even when the Org DO instance is ejected from memory
    - From a single browser, a person can only be logged into one Org at a time, but they can switch Orgs without logging out
    - If a Person is logged in on two browsers, it will have two sessions and they can be to different Orgs
    - The cookie will remain on the Person's machine but the next time they go to use it, it may indicate that the session has expired. In which case, they will need to login again
    - Listens on the websocket for operations and processes them or hands them off to an aggregator DO

  #### Org DO: Attached data transactional operations

    - DB schema. Everything except the last field (value) is considered part of "meta" in the conversation below:
      - entityID: TEXT NOT NULL
      - deleted: BOOLEAN NOT NULL CHECK (deleted IN (0, 1))
      - validFrom: TEXT (ISO 8601) NOT NULL
      - validTo: TEXT (ISO 8601) NOT NULL
      - oldValidFrom: TEXT (ISO 8601) NOT NULL - This is used for optimistic concurrency, but it's not needed long term. Maybe we can pass it into D1 so it's available to the triggers shown below but not actually have it as a column in the table?
      - orgID: TEXT NOT NULL
      - orgNodeID: TEXT NOT NULL
      - snapshotOrgNodeID: TEXT NOT NULL - When the entity is created, it will be the same as orgNodeID but if the data is moved to a different org node, it will be updated to that new orgNodeID. We can use this to recreate any query/aggregation for any point in time.
      - value: BLOB (JSONB)

    - The parameters including the operation are in the body of the request
    - If the request parameters specifies an asOf timestap for the value at a particular moment in time as opposed to the latest, only the **read** operation is supported. If any other operation is attempted, it will error.
    - It will query D1 to fetch the correct row for that entity id and asOf
    - If that's not found, it will error
    - It will then determine what level of permission (read, write, admin) the Person has for the Org node associated with the entity
    - If the Person has no permission, it will error
  
    - Operations:
  
      - **read**
        - If the Person does not have at least read permission on the Org node, it will error. Otherwise...
        - If will return the value and meta
  
      - **update**
        - If the Person does not have at least write permission on the Org node, it will error. Otherwise...
        - The input for this is a diff, an oldValidFrom for optimistic concurrency, and optionally a new validFrom
        - You cannot send in an entire new value. If you don't have the old value, you must first do a read and then send in a diff
        - First it will build the new snapshot meta with a new validFrom, diff/previousValues, etc.
        - It will also include a DB column for oldValidFrom which we use as a sort of eTag for optimistic concurrency
        - INSERT this new snapshot
        - A BEFORE INSERT trigger will RAISE(ROLLBACK) if NEW.oldValidFrom !== oldSnapshot.validFrom. Look at this example https://stackoverflow.com/questions/11902416/trigger-on-update-to-insert-row-if-count-is-0. This is the optimistic concurrency check.
        - That same trigger can also have a check (... AND NEW.validFrom > oldSnapshot.validFrom) because the design assumes that snapshots are at least a millisecond apart.
        - An AFTER INSERT trigger will then update the old row with a new validTo
        - If that fails, it will error. Otherwise...
        - Next, it will send a message back to the same session containing the new value and meta
        - Finally, it will update any other subscribers with the diff and meta. This process will include functionality to expect an aknowledgement form the client. If it doesn't get it in say 30 seconds, it will assume that the client is no longer subscribed and will remove it from the list of subscribers.

      - **delete**
        - If the Person does not have at least write permission on the Org node, it will error. Otherwise...
        - It creates a new snapshot

      - **undelete**
      - **subscribe**
        - First, it calls **read**. If that does not error...
        - Then, it adds the Person to the list of subscribers for that entity

      - **unsubscribe**
        - It removes the Person from the list of subscribers for that entity


  - It will not maintain websocket connections itself. All communication will go through the Org DOs which act as a proxy.
  - It maintains a list of Org:SessionIDs as subscribers.
  - I will mimick how itty-durable works but instead of just proxying the Temporalizable DO Class's API to the calling Cloudflare Worker, I'll proxy it all of the way to the client-side store. I don't want to use itty-durable because I want cbor-x to be the transport mechanism and itty-durable uses JSON but I will certainly learn how itty-durable works and use it as a starting point.
  - It has these instance methods:
    - `post`
    - `get` - If an `ifModifiedSince` header is provided, it will of course return a 304 if the entity has not changed since that time as expected. However, it returns the diff from that time if that value in `ifModifiedSince` exactly matches an old snapshot. Failing that, it will reluctantly return the entire value and meta.
    - `patch` - Must include `ifUnmodifiedSince` header. If it is the latest, it will perform the patch. Failing that, it will return an error code and the entire value and meta. [Maybe later: If it's not the latest, Temporalizable will determine if the diff is in conflict with other changes from that point. If not, the change will go forward. Otherwise, it will error and return the diff from version indicated by `ifUnmodifiedSince` if that matches an old snapshot.]

    - `put` is not needed because we want to use `patch`. If the downstream consumers don't have the latest, they will have to build it from either the response from `patch` or `get`.
    - I'm not sure what the `fetch` method will do. Maybe to immediately upgrade to websocket. Maybe for initial DO creation?
  - It implements VersioningTransactionalDOWrapper-like functionality but without the overhead of preserving the original DOs behavior
  - It will not maintain websocket connections. 
  - It sends changes downstream whenever `this.value` or `this.meta` changes. `this.current` is no longer used. Downstream headed messages contain a `diff` and a `meta` field. The meta indicates the validFrom which should match the downstream latest timestamp before applying the diff. If a downstream receipient receives a diff that doesn't match their latest, they will have to initiate a round trip `get` to become current. We will also populate the virtual headers for downstream messages.
  - It tries to save `this.value` under a single DO storage key but the first time that fails it switches to chunked mode. 
  - In chunked mode, it uses cbor-x to create an ArrayBuffer and then uses view windows on that ArrayBuffer to save it in chunks. Since cbor-x is more space efficient, it may be only one chunk.
  - A field in meta will indicate if the value is saved in chunks. Once in chuncked mode.
  - The same strategy will be used for `this.meta` but it will be much smaller so I suspect it will never be in chunked mode
  - Helper functions abstract away the chunking so that the rest of the code doesn't have to know about it regardless of whether it's saving `this.value` or `this.meta`.


 

## Client-side

### SharedWorker
  - It establishes the websocket connection to an Org on login or reconnection using stored cookie credentials
  - It creates a shared worker class (SWC, see below) instance for each enityID with an active subscription
  - When a change comes from upstream over the websocket connection, it sends that to the appropriate SWC
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

The biggest complexity associated with this approach is that there isn't a way to do round-trip request-response across browser contexts. However, we can simulate that. See "Simulating request-response behavior over websockets" below.

### DAGTree SWC

  - The state in the current Tree DO is maintained in separate `this.nodes`, and `this.edges` members. I'll have to move them into a single object `this.value = { nodes, edges }` member. This will allow it to work with the diffing and patching of Temporalizable.
  - Right now, edges use an array like this `{ <id: string>: [<id: string>] }`. I must change it to `{ <id: string>: { <id: string>: true } }` to make the diffs be readable when debugging. Otherwise, they'll be an inscrutible numeric index.
  - `tree` is derived as needed. The heavy lifting of this SWC is to translate between the upstream format of `{ value, meta }` and the `tree` format that is used by the tree control. That code is mostly working in the current Tree DO with the only bit remaining being the population of orphaned. I'll have to move that code into this SWC.
   
### Store

  - It gets its value from the SWCs via the shared worker in the form of a single value
  - If a change comes from the Person, it pushes it onto the `upstream` broadcast channel which means the shared worker will get it
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
