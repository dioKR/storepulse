# storepulse Wiki

Welcome! This wiki holds design documents for storepulse.

> **Note for maintainers**: these files live in `wiki/` inside the main repo so
> they are versioned with the code. To publish them to the GitHub Wiki, copy each
> file as a Wiki page (page name = file name) — GitHub Wiki renders the Mermaid
> diagrams natively.

## Pages

- [[Architecture]] — system overview, data flow, the normalized model, and
  extension points (including the `status.json` snapshot contract). Start here.

## Related docs (in the main repo)

- [Snapshot schema (`status.json`)](https://github.com/dioKR/storepulse/blob/main/docs/snapshot-schema.md) —
  the JSON contract between `storepulse snapshot` / `storepulse serve` and
  anything that consumes the board.
