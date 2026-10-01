# Security

## Reporting a vulnerability

Please report security problems privately through
[GitHub security advisories](https://github.com/devladinci/saystack/security/advisories/new). Do not open a public
issue.

Include the package and version, what an attacker can do, and the smallest steps to reproduce it.

## Supported versions

saystack is pre-1.0. Fixes go into the latest minor release of each package.

## What to keep in mind when you deploy

`@saystack/server` sits between browsers and your speech engines, and holds the engine tokens. It does not
authenticate anyone by itself:

- Put your own auth in front of the routes. For the realtime WebSocket, pass `realtime.authorize`.
- CORS allows any origin unless you pass `cors: { origin }`, or `cors: false` to handle it yourself.
- Set `maxTextChars` and `realtime.maxBytes` so one request cannot run up your engine bill.
- Engine tokens belong on the server. Never send them to the browser.
