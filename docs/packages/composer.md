# Composer

`@oaslananka/composer` aggregates multiple MCP backends behind one MCP endpoint. It loads backend config, connects clients, and republishes namespaced tools so a single client can target several servers at once.

## Install

```bash
npm install -g @oaslananka/composer
```

## Key options

| Option | Meaning |
| --- | --- |
| `--config` | Path to `composer.yml` describing backend servers |

## Examples

```bash
composer serve --config ./composer.yml
composer list-backends --config ./composer.yml
composer list-tools --config ./composer.yml
```

## Troubleshooting

- Namespacing collisions are easiest to diagnose with `list-tools`, which shows the final tool names visible to clients.
- Keep backend names stable because those names become part of the public tool surface.
- Use `sentinel` upstream of risky backends if you need policy enforcement before aggregation.
