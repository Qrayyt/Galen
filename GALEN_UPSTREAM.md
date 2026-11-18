# Galen — upstream provenance

Galen is maintained by Galenite as a branded, localized extension of the open-source Dodaios codebase.

## Primary source

- Project: https://github.com/Dodaios/Dodaios
- Imported commit: `d53cb8d2343567280ac0ab013dac73b633060c93`
- Original license: Apache License 2.0
- Original copyright and contributor notices: `LICENSE`, `NOTICE`, `third_party/`
- Source import: `.github/workflows/bootstrap-dodaios.yml`
- Imported source retains native paths `dodaios/` and `jarvis.*` internally for compatibility.

The imported source intentionally excludes upstream GitHub Actions workflows, design studies (`art/`) and demonstration media (`assets/demo/`). These are not needed to run the application.

## Galen branding

- Galenite identity assets preserved from the original private Galen 0.8 in `assets/galen-brand/`.
- The original project is preserved at `backup/galen-0.8-before-dodaios` from commit `8673e762793b5b2164412392480047117a5e1324`.
- Work on version 1.0 happens on `feat/galen-1.0-dodaios`.
- Product trademark and identity are Galen / Galenite. This is an independent fork, not an official Dodaios release.

## Other sources

The additional integrations are attributed with pinned upstream commit and license in their respective `third_party/galen-*/` and `integrations/` directories.

Projects: [OpenDex](https://github.com/wassgha/opendex), [Kaizumi](https://github.com/MusayevDoniyor/kaizumi), [Elissa](https://github.com/inginddie/elissa), [OpenRealtime](https://github.com/bojieli/OpenRealtime). Their MIT copyright notices remain applicable to the actual incorporated source.

## Important limitations

ChatGPT sign-in through the official Codex CLI and model-provider API credentials are distinct. Running a provider requires the authorization method that provider officially supports. A preview release is not evidence that every provider or third-party add-on was functionally tested on all operating systems.
