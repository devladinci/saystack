# @saystack/server

## 0.1.1

### Patch Changes

- b86fbbf: `maxBodyBytes` now counts the bytes that arrive, not only the `content-length` the client declares, so a chunked or
  multipart upload can no longer go past it.
- Updated dependencies [b86fbbf]
  - @saystack/core@0.1.1

## 0.1.0

### Minor Changes

- 38c80d8: Initial release.

### Patch Changes

- Updated dependencies [38c80d8]
  - @saystack/core@0.1.0
