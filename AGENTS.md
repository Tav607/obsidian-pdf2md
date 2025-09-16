# Repository Guidelines

## Project Structure & Module Organization
The plugin entry point is `main.ts`, which registers the Gemini-powered PDF conversion workflow and the settings tab. The bundled output `main.js` and stylesheet `styles.css` ship with the release artifacts listed in `manifest.json` and version mappings in `versions.json`. Build tooling lives in `esbuild.config.mjs`, while TypeScript configuration resides in `tsconfig.json`; keep any new utilities alongside `main.ts` until they deserve their own module.

## Build, Test, and Development Commands
Run `npm install` once to pull dependencies. Use `npm run dev` for a fast esbuild watch task that recompiles `main.ts` into `main.js` while you iterate inside a test vault. Execute `npm run build` before publishing to type-check with `tsc` and emit a production bundle. The release helper `npm run version` updates `manifest.json` and `versions.json` and stages them for review.

## Coding Style & Naming Conventions
Code in TypeScript with tab indentation as in the existing sources. Favor descriptive PascalCase for classes (`PDF2MDWithGemini`) and camelCase for functions, methods, and settings keys. Prefer single quotes for strings and keep Notice messages concise. When adding files, mirror the current naming pattern (`something.ts` for logic, `something.css` for styles) so Obsidian’s loader can detect them easily.

## Testing Guidelines
Automated tests are not yet configured; rely on manual verification. Run `npm run dev`, load the plugin from your development vault, and exercise a PDF conversion, ensuring upload notices progress through start → upload → response and the resulting Markdown lands beside the source file. Document any reproduction steps in the PR description so reviewers can follow them.

## Commit & Pull Request Guidelines
Recent commits mix version tags (`1.0.2`) with imperative summaries; follow suit by leading with a concise subject line that explains the change or release number. Reference related issues or vault scenarios in the body and keep scope focused. Pull requests should include a short narrative, testing notes, and screenshots of any settings UI updates. Ensure generated files remain up to date (`main.js`, `manifest.json`, `versions.json`) before requesting review.

## Configuration & Secrets
Never commit actual Gemini API keys. Add placeholders only, and confirm `.obsidian` vault paths in documentation rather than source control. If a configuration knob needs a default, update `DEFAULT_SETTINGS` and describe the behavior in `README.md` to keep users informed.
