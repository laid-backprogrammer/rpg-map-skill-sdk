import { build, stop } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const output = join(root, 'output', 'demo');

async function dependencyNotices() {
  const sections = [await readFile(join(root, 'LICENSE'), 'utf8')];
  const packages = [
    ['pathfinding', 'README.md', true],
    ['heap', 'README.md', true],
    ['poisson-disk-sampling', 'LICENSE', false],
    ['moore', 'LICENSE.md', false],
  ];
  for (const [name, filename, inReadme] of packages) {
    const text = (await readFile(join(root, 'node_modules', name, filename), 'utf8')).replace(/\r\n/g, '\n');
    const offset = inReadme ? text.lastIndexOf('\nLicense\n-------') : 0;
    if (offset < 0) throw new Error(`License section missing for ${name}.`);
    const extra = name === 'heap'
      ? '\nCopyright (c) 2001-2012 Python Software Foundation; All Rights Reserved.\nUpstream heap.js ports Python heapq to JavaScript. Dependency source is unmodified; esbuild wraps and bundles it for browser delivery.\n'
      : '';
    sections.push(`\n----- ${name} -----\n${extra}${text.slice(offset)}`);
  }
  return sections.join('\n');
}

export async function buildDemo() {
  await mkdir(output, { recursive: true });
  try {
    await build({
      absWorkingDir: root,
      entryPoints: ['examples/demo/app.js'],
      outfile: join(output, 'bundle.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['es2020'],
      legalComments: 'linked',
      footer: { js: '/* Runtime dependency licenses: ./THIRD_PARTY_LICENSES.txt */' },
      sourcemap: false,
      logLevel: 'info',
    });
  } finally {
    stop();
  }
  const source = await readFile(join(root, 'examples/demo/index.html'), 'utf8');
  if (!source.includes('src="./app.js"')) throw new Error('Demo entry script was not found in index.html.');
  await writeFile(join(output, 'index.html'), source.replace('src="./app.js"', 'src="./bundle.js"'));
  await copyFile(join(root, 'examples/demo/style.css'), join(output, 'style.css'));
  await writeFile(join(output, 'THIRD_PARTY_LICENSES.txt'), await dependencyNotices());
  await copyFile(join(root, 'THIRD_PARTY_NOTICES.md'), join(output, 'THIRD_PARTY_NOTICES.md'));
  console.log('Demo built: output/demo/index.html');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildDemo();
}
