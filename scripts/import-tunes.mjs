// Fetch open folk tune collections into apps/web/public/tunes, with their
// licence and attribution, so the app can read and show them.
//
//   node scripts/import-tunes.mjs            all sources
//   node scripts/import-tunes.mjs oneills    one source
//
// Each source becomes one ABC file (headed by its licence notice) plus an entry
// in tunes/sources.json. Downloads are pinned and checked against a hash.
// Needs `unzip` on the PATH for sources that come inside a zip.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps/web/public/tunes');

const LICENCES = {
  'GPL-2.0-or-later': {
    name: 'GNU General Public License, version 2 or later',
    url: 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html',
    text: 'https://raw.githubusercontent.com/spdx/license-list-data/v3.25.0/text/GPL-2.0-or-later.txt',
  },
};

// Only sources whose terms allow publishing them on a public, non-commercial site.
// See the licence review in the project for the ones left out and why.
const SOURCES = [
  {
    id: 'oneills',
    name: "O'Neill's Music of Ireland",
    description: "1,850 Irish airs and dance tunes collected by Francis O'Neill and published in Chicago in 1903.",
    licence: 'GPL-2.0-or-later',
    attribution:
      "O'Neill's Music of Ireland (1903). ABC transcriptions copyright 1997-2000 the contributors to the O'Neill's Project, used under the GNU GPL v2 or later. Each tune's transcriber is credited in its Z: field.",
    homepage: 'https://trillian.mit.edu/~jc/music/book/ONeills/_1850/',
    via: { name: 'the music21 corpus', url: 'https://github.com/cuthbertLab/music21/tree/master/music21/corpus/oneills1850' },
    // music21 ships the O'Neill's Project files in its corpus; the wheel on PyPI is the reachable pinned copy.
    download: {
      index: 'https://pypi.org/pypi/music21/10.5.2/json',
      file: 'music21-10.5.2-py3-none-any.whl',
      zipGlob: 'music21/corpus/oneills1850/*.abc',
    },
  },
];

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Resolve a wheel's real URL and hash from the PyPI index, so the pin is checked. */
async function pypiFile(index, file) {
  const meta = JSON.parse((await get(index)).toString('utf8'));
  const f = meta.urls.find((u) => u.filename === file);
  if (!f) throw new Error(`${file} not listed at ${index}`);
  return { url: f.url, sha256: f.digests.sha256 };
}

async function importSource(src) {
  const tmp = mkdtempSync(join(tmpdir(), `tunes-${src.id}-`));
  try {
    const { url, sha256 } = await pypiFile(src.download.index, src.download.file);
    const zip = await get(url);
    const hash = createHash('sha256').update(zip).digest('hex');
    if (hash !== sha256) throw new Error(`${src.download.file}: hash ${hash} does not match ${sha256}`);
    const zipPath = join(tmp, src.download.file);
    writeFileSync(zipPath, zip);
    const files = join(tmp, 'files');
    mkdirSync(files);
    execFileSync('unzip', ['-q', '-j', zipPath, src.download.zipGlob, '-d', files]);
    const names = readdirSync(files)
      .filter((n) => n.endsWith('.abc'))
      .sort();
    const body = names.map((n) => readFileSync(join(files, n), 'utf8').replace(/\r\n?/g, '\n').trim()).join('\n\n');
    const tunes = (body.match(/^X:/gm) ?? []).length;
    const lic = LICENCES[src.licence];
    const header = [
      `% ${src.name}`,
      `% ${src.attribution}`,
      `% Licence: ${lic.name} (${lic.url}); full text in LICENSES/${src.licence}.txt`,
      `% Source: ${src.homepage}`,
      `% Via: ${src.via.name}, ${src.via.url}`,
      `% Imported from ${src.download.file} (sha256 ${sha256}) by scripts/import-tunes.mjs`,
      '',
    ].join('\n');
    writeFileSync(join(out, `${src.id}.abc`), `${header}\n${body}\n`);
    console.log(`${src.id}: ${tunes} tunes from ${names.length} files`);
    return {
      id: src.id,
      name: src.name,
      description: src.description,
      file: `${src.id}.abc`,
      tunes,
      licence: { id: src.licence, name: lic.name, url: lic.url, file: `LICENSES/${src.licence}.txt` },
      attribution: src.attribution,
      homepage: src.homepage,
      via: src.via,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const wanted = process.argv.slice(2);
mkdirSync(join(out, 'LICENSES'), { recursive: true });
const manifestPath = join(out, 'sources.json');
let manifest = [];
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  // First import.
}
for (const src of SOURCES.filter((s) => !wanted.length || wanted.includes(s.id))) {
  const entry = await importSource(src);
  manifest = [...manifest.filter((m) => m.id !== entry.id), entry];
  writeFileSync(join(out, 'LICENSES', `${src.licence}.txt`), await get(LICENCES[src.licence].text));
}
manifest.sort((a, b) => SOURCES.findIndex((s) => s.id === a.id) - SOURCES.findIndex((s) => s.id === b.id));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
