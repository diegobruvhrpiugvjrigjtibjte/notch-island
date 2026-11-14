# Contributing

Thanks for helping! NotchIsland is a Windows-only Electron app; most changes need no special setup.

```bash
npm install
npm start                       # run the app (unset ELECTRON_RUN_AS_NODE if you use VS Code's terminal)
node test/brain.test.js         # quick tests: brain, executor, calc, voice, hub
```

## Add a language

The UI source text is Italian and each language is a dictionary of exact texts plus a few regex patterns.

1. Copy `src/i18n/en.js` to `src/i18n/<code>.js` (e.g. `es.js`) and translate the **values** (keep the keys, which are the Italian source texts).
2. Add `['<code>', 'Name']` to `LANGS` in `src/i18n/core.js`.
3. Find texts you missed: `node test/i18n-collect.js <code>` walks every tab and prints the strings that are still untranslated (proper nouns, units and already-translated results appear too; ignore those).

The assistant understands English and Italian commands (`src/brain.js`). Supporting a new spoken language means adding rules there; the UI translation alone does not change what the assistant understands.

## Add an assistant command

1. Add a rule in `src/brain.js` (`R(/regex/, (m) => ({ intent, args }))`). Rules are matched in order on lower-case, accent-free text.
2. Handle the intent in `src/executor.js` (`run()`), returning `{ ok, say }` in the user's language with the `L(lang, it, en)` helper.
3. Add a phrase to `test/brain.test.js` and a check to `test/executor.test.js`.

## Add a widget

Add an entry to `WIDGETS` in `src/island/widgets.js` (`title`, `icon`, `span`, `mount(el, ctx)`) and its id to `WIDGET_IDS` in `src/store.js`.

## Notes

* No emojis in the UI: use the SVG icons in `src/shared/icons.js`.
* The window never uses glass/blur effects; themes are solid colors.
* Keep network calls to the documented services and update the README privacy section if you add one.
* `npm run docs:screenshots` regenerates the README screenshots using demo data (`NOTCH_DEMO=1`).
