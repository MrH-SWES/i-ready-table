# Curriculum integration

This standalone app is derived from the Teaching Table prototype in `MrH-SWES/math-things`.

## Current behavior

- Loads licensed curriculum EPUBs locally in the browser.
- Reads the EPUB 3 navigation table of contents.
- Opens lesson/session sections in draggable, resizable Teaching Table windows.
- Resolves packaged EPUB images, styles, fonts, and media locally.
- Does not commit or upload curriculum EPUB content to this public repository.
- Math Things tools continue to open from the deployed Math Things site.

## Architecture

1. Source layer — faithful local EPUB content and source hierarchy.
2. Curriculum model — normalized grade/unit/lesson/session/problem/representation metadata.
3. Math Things mapping — relevant manipulatives and launch state.

The next build step is to normalize a representative Grade 4 lesson and map its representations to Math Things.
