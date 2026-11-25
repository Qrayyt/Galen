# GLNT package contract v1

Public GitHub repositories only. Root file `galen-extension.json` contains:

```json
{"schema":1,"name":"example-skill","title":"Example","description":"Example skill","type":"skill","version":"1.0.0","min_galen":"1.0.0","category":"general","permissions":["tools"],"entry":"SKILL.md","files":{"SKILL.md":"<64 hex SHA-256 characters>"}}
```

For a plugin, type is plugin, entry is plugin.json, and optional mcp.json is declared in files. For a skill, entry is SKILL.md. Optional icon is a declared PNG, JPEG or WebP. Every package file other than the manifest must be listed with a SHA-256 digest. Keep the distribution repository declarative: no scripts, binary executables, hidden files, links or submodules. Use the separate development repository if necessary. The catalog records the immutable repository commit and manifest digest, not package content. Archive bytes go directly from codeload.github.com to the desktop client.

Archive v1 is deliberately restrictive: at most 8 MiB compressed, 16 MiB expanded, 512 KiB per file, 128 declared files, no special paths or executable modes. Validation is in memory; no archive-extraction filesystem paths are used. The approved manifest describes source and permissions, not a guarantee of author trust. Activation must use the existing reviewed extension loaders and a separate consent boundary. Unknown schemas are rejected rather than interpreted.
