# Math Things edTech — Teaching Table

Teaching Table is a classroom mathematics workspace from **Math Things edTech**,
created by William Henderson. It combines digital Math Things manipulatives,
curriculum materials, written responses, worksheet display, and read-aloud tools.

- Company: https://maththingsedtech.com
- Contact: [will@maththingsedtech.com](mailto:will@maththingsedtech.com)
- Existing public access: https://mrh-swes.github.io/i-ready-table/
- Current canonical classroom app: https://mrh-swes.github.io/math-things/apps/teaching-table/
- Planned product domain: https://app.maththingsedtech.com — migration verification pending.

- Load licensed i-Ready Classroom Math EPUBs locally in the browser.
- Curriculum content stays on the device and is not stored in this public repository.
- Phone worksheet uploads use the existing Teaching Table Cloudflare relay.
- Premium speech requires the existing relay's configured provider; device speech is the fallback.
- Manipulative source: https://github.com/MrH-SWES/math-things

The latest `main` entry point redirects to the canonical app. Cloudflare builds
use a pinned copy of its current source and catalog without changing that Pages
entry point or the canonical repository. See [migration and verification](deployment/README.md).
