
## Login

### Current

```mermaid

sequenceDiagram
  participant User
  participant /send-code
  participant /verify-code
  participant KV  
  User->>/send-code: POST: { email, targetURL }
  /send-code->>KV: SESSION.put(code, { email, targetURL })
  /send-code-->>User: (via email) code
  User->>/verify-code: code
  /verify-code->>KV: SESSION.get(code)
  KV-->>/verify-code: { email, targetURL }
  /verify-code->>KV: SESSION.put(sessionID, { email, sessionID })
  /verify-code-->>User: REDIRECT to targetURL while setting sessionID in cookie

```

### Future

Changes:
- Change "email" to "emailAddress" for both endpoints and UI
- Rather than using the 6-digit `code` as the KV key, use `${code}+${emailAddress}`. This will avoid collisions as we scale.
- Use peopleLookup to find the personID
- add personID to the SESSION KV and cookie. So, `SESSION.put(sessionID, { personID, emailAddress, sessionID })`

```mermaid

sequenceDiagram
  participant User
  participant /send-code
  participant /verify-code
  participant KV
  User->>/send-code: POST: { emailAddress, targetURL }
  activate /send-code
  /send-code->>KV: SESSION.put(`${code}+${emailAddress}`, { emailAddress, targetURL })
  /send-code-->>User: (via email) code
  deactivate /send-code
  User->>/verify-code: code
  activate /verify-code
  /verify-code->>KV: SESSION.get(`${code}+${emailAddress}`)
  KV-->>/verify-code: { emailAddress, targetURL }
  /verify-code->>KV: PEOPLE_LOOKUP.getWithMetadata(`emailAddress/${emailAddress}`)
  KV-->>/verify-code: { personID }
  /verify-code->>KV: SESSION.put(sessionID, { personID, emailAddress, sessionID })
  /verify-code-->>User: REDIRECT to targetURL while setting sessionID in cookie
  deactivate /verify-code

```