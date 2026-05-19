# Templates

The migrator emits scaffolds via the embedded `templates.ts` module (compiled
into `dist/`). Future versions of this package may ship templates as raw
files here so consumers can `cp node_modules/@caistech/portfolio-migrator/templates/<file>`
without running the CLI — currently every template is generated at runtime
to keep token substitution (product slug, route list, etc.) clean.
