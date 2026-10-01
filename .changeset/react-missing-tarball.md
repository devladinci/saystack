---
"@saystack/react": patch
---

No code changes. The same code as 0.2.0, published again because 0.2.0's tarball never reached the
registry: the version metadata and its provenance attestation are there, but
`npm i @saystack/react@0.2.0` answers 404. `@saystack/react-web` and `@saystack/react-native` 0.2.0
hit the same 404 through their dependency on it.
