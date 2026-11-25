# Galen — brand guidelines

Galen is a desktop AI assistant by Galenite, based on Dodaios. The visible product identity is **Galen**; Galenite is the developer. Upstream attribution and licenses remain intact (see [GALEN_UPSTREAM.md](../GALEN_UPSTREAM.md)).

## Visual identity

- Use the Galen geometric symbol from [assets/galen-brand/galen.svg](../assets/galen-brand/galen.svg) as the source of truth. Generate packaged assets with `python scripts/galen/make_brand_assets.py`; verify them with `--check`.
- Neutral monochrome surfaces, typography and controls in both light and dark themes. Avoid beige, metallic gold, colored decorative gradients and legacy hooded-figure marks. Retain meaningful status colors and provider logos.
- Reuse design tokens from `dodaios/ui/web/frontend/src/index.css`. Use semantic foreground, background, border, muted and status tokens rather than fixed white text in both themes.
- Retain Inter for the interface and JetBrains Mono for code and terminal output. Preserve keyboard focus, accessible contrast and reduced-motion settings.
- The configurable assistant name is independent of product identity. Never overwrite the user's chosen name.

## Product copy

- Russian is the default interface language. Use natural Russian, consistent terminology and neutral phrasing. Preserve interpolation placeholders and technical identifiers.
- Say Galen in user-facing product labels, notifications and system prompts. Use Galenite for the developer.
- Use **GLNT** for the in-app marketplace. Until its own registry is connected, distinguish the GLNT interface from the external catalogue and publishing infrastructure it currently uses. Do not imply Galenite owns or verifies externally supplied entries.
- Keep `dodaios`, `jarvis`, legacy config filenames, plugin entry points and persistent identifiers where compatibility requires them. Do not bulk-rename code or data paths.
- Distinguish tested capabilities from experimental or unavailable functions. Never fabricate successful actions or runtime activity.

## Release checks

Run `python scripts/galen/validate_release.py` and `python scripts/galen/check_russian_locales.py`. Review the installed app in both themes, including first run, HUD, settings, tray, errors and updates. A passing source check is not a substitute for a real desktop test.
