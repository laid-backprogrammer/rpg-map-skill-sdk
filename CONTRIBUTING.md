# Contributing

Use Node.js 22+ and run `npm ci`. Keep the SDK independent of the renderer, AI
provider and story state. Preserve deterministic seeded output and the distinction
between collision footprints and visual ranges.

Before submitting changes:

```sh
npm test
npm run check:types
npm run check:release
npm run demo:build
npm run sdk:pack
npm run test:package
```

Add focused tests for changed generator or navigation invariants. Asset or
renderer integrations also need real visual inspection; mathematical validation
alone does not establish correct occlusion.

Do not submit API keys, recorded voices, private footage, commercial fonts or
unlicensed artwork. Document the source and redistribution terms of any proposed
new dependency or media. Explain unsupported cases rather than silently falling
back or claiming universal correctness.
