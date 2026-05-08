# ciphergift subgraph

The Graph subgraph for CipherGift. Replaces the in-memory
`packages/indexer` for hosted deployments and gives the frontend a
GraphQL endpoint with persistence, free 100k queries/month on the
hosted Studio tier, and no infra to babysit.

The frontend reads from `NEXT_PUBLIC_SUBGRAPH_URL` (preferred) and
falls back to `NEXT_PUBLIC_INDEXER_URL` (REST) and then to direct
chain reads — so you can deploy this without breaking local dev.

## Layout

```
packages/subgraph/
├── subgraph.yaml          # manifest (data sources, network, addresses)
├── schema.graphql         # entity types — mirror of packages/indexer/store.ts
├── abis/                  # event ABIs the manifest references
│   ├── CipherGift.json
│   └── ConfidentialETHVault.json
└── src/                   # AssemblyScript event handlers
    ├── cipher-gift.ts
    └── vault.ts
```

`generated/` is created by `pnpm codegen` and gitignored.

## One-time deploy (Sepolia)

1. Sign in to Subgraph Studio: https://thegraph.com/studio/
2. Create a subgraph slug (e.g. `ciphergift`) and copy your **deploy key**.
3. Edit `subgraph.yaml` — set the `address:` and `startBlock:` fields for
   both data sources. Use the same values you'd put in
   `packages/indexer/.env.local`:
   - `CipherGift` data source → `CIPHERGIFT_ADDRESS`
   - `ConfidentialETHVault` data source → `VAULT_ADDRESS`
   - `startBlock` → block at which CipherGift was deployed (avoids
     scanning unrelated history).
4. From this directory:
   ```sh
   pnpm install
   pnpm auth <deploy-key>
   pnpm codegen        # generates ./generated/
   pnpm build          # type-checks the AS handlers + manifest
   pnpm deploy:studio  # uploads + indexes (Studio is the default node)
   ```
5. Studio shows a "Query URL" once indexing finishes. Copy it into the
   site's `.env.local`:
   ```
   NEXT_PUBLIC_SUBGRAPH_URL=https://api.studio.thegraph.com/query/<id>/ciphergift/<version>
   ```

## Local development

Running graph-node + IPFS locally is heavy. For day-to-day dev keep
using `packages/indexer` and point the site at it via
`NEXT_PUBLIC_INDEXER_URL=http://localhost:42069`.

If you do want a local subgraph, the standard graph-node docker compose
works:

```sh
pnpm create:local
pnpm deploy:local
```

## Updating after a contract change

When CipherGift.sol's event surface changes:

1. Sync the event signatures in `abis/CipherGift.json` and the event
   handler list in `subgraph.yaml`.
2. If a new entity field is needed, add it to `schema.graphql` and the
   handler that produces it.
3. Bump the subgraph version (e.g. `pnpm deploy:studio --version-label v0.0.2`)
   and Studio will reindex.
