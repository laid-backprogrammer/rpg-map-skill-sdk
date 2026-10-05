# Third-Party Notices

Project code and original workflow documentation are MIT licensed. Dependencies
retain their own licenses; the project license does not replace them.

## Runtime Dependencies

| Package | Version | License | Upstream |
| --- | --- | --- | --- |
| pathfinding | 0.4.18 | MIT | https://github.com/qiao/PathFinding.js |
| heap (transitive) | 0.2.5 | PSF | https://github.com/qiao/heap.js |
| poisson-disk-sampling | 2.3.1 | MIT | https://github.com/kchapelier/poisson-disk-sampling |
| moore (transitive) | 1.0.0 | MIT | https://github.com/hughsk/moore |

Dependencies are installed through npm; their source is not vendored in this
repository. Bundled browser-demo output contains dependency code and is covered
by these upstream licenses. Preserve `output/demo/THIRD_PARTY_LICENSES.txt`, the
copied notices, and any generated legal-comment file when distributing that
output. The build extracts full runtime license texts because README-only
licenses are not automatically retained by esbuild. Inspect each installed package's license and
package metadata for its complete terms, including heap's PSF notice.

## Development Tools And Optional Integrations

esbuild and TypeScript are development dependencies with their own upstream
licenses. Optional GSAP and HyperFrames integrations are not shipped by this
project and are not relicensed as MIT. Obtain them from their official sources
and follow their terms. The skills describe integration behavior; they do not
copy the official skills or runtime code.

No recorded voice, footage, commercial fonts, reference screenshots, AI-generated
game artwork, or third-party sound library is included. The layout comparison
image is generated from the SDK's own geometry, not from the private game.
