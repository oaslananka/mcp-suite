# Bridge

`@oaslananka/bridge` generates MCP server surfaces from API descriptions. It is intended for teams that already have OpenAPI or schema-driven APIs and want a faster path to MCP exposure.

## Install

```bash
npm install -g @oaslananka/bridge
```

## Common inputs

| Input | Purpose |
| --- | --- |
| OpenAPI document | Source for tool generation |
| Schema mapping config | Controls naming and argument exposure |
| Runtime template | Generated server structure |

## Examples

```bash
bridge generate --input ./openapi.yaml --output ./generated
bridge inspect --input ./openapi.yaml
bridge validate --input ./openapi.yaml
```

## Troubleshooting

- Clean schema names matter. Normalize operation ids before generation when possible.
- Review generated tool descriptions before publishing; the bridge preserves source semantics and unclear source docs will leak through.
- Keep generator tests fixture-driven so parser regressions are easy to catch.
