import { makeLiblouisTranslator, type LiblouisGrade, type Translator } from '../core';

// liblouis ships an emscripten build + easy-api as UMD scripts that register on
// the global `this`. They don't bundle cleanly (they reference node's fs/path,
// gated by an environment check), so we load them as *classic scripts* via their
// asset URLs — emscripten then takes its browser path and exposes `window.liblouis`.
import buildUrl from 'liblouis-build/build-no-tables-utf16.js?url';
import easyApiUrl from 'liblouis/easy-api.js?url';

// The de-de-g1/g2 table closure, bundled as raw text and written into liblouis'
// in-memory FS so translation is synchronous (no worker, no XHR).
import unicodeDis from 'liblouis-build/tables/unicode.dis?raw';
import deDeG0 from 'liblouis-build/tables/de-de-g0.utb?raw';
import deDeG1 from 'liblouis-build/tables/de-de-g1.ctb?raw';
import deDeG2 from 'liblouis-build/tables/de-de-g2.ctb?raw';
import deChardefs6 from 'liblouis-build/tables/de-chardefs6.cti?raw';
import deDeAccents from 'liblouis-build/tables/de-de-accents.cti?raw';
import deG0Core from 'liblouis-build/tables/de-g0-core.uti?raw';
import deG1Core from 'liblouis-build/tables/de-g1-core.cti?raw';
import deG2Core from 'liblouis-build/tables/de-g2-core.cti?raw';
import countries from 'liblouis-build/tables/countries.cti?raw';
import deEurobrl6 from 'liblouis-build/tables/de-eurobrl6.dis?raw';
import digits6 from 'liblouis-build/tables/digits6DotsPlusDot6.uti?raw';
import latinLetter6 from 'liblouis-build/tables/latinLetterDef6Dots.uti?raw';
import litdigits6 from 'liblouis-build/tables/litdigits6Dots.uti?raw';

const TABLES: Record<string, string> = {
  'unicode.dis': unicodeDis,
  'de-de-g0.utb': deDeG0,
  'de-de-g1.ctb': deDeG1,
  'de-de-g2.ctb': deDeG2,
  'de-chardefs6.cti': deChardefs6,
  'de-de-accents.cti': deDeAccents,
  'de-g0-core.uti': deG0Core,
  'de-g1-core.cti': deG1Core,
  'de-g2-core.cti': deG2Core,
  'countries.cti': countries,
  'de-eurobrl6.dis': deEurobrl6,
  'digits6DotsPlusDot6.uti': digits6,
  'latinLetterDef6Dots.uti': latinLetter6,
  'litdigits6Dots.uti': litdigits6,
};

interface LiblouisApi {
  version(): string;
  translateString(tableList: string, text: string): string;
  getFilesystem(): { mkdir(p: string): void; writeFile(p: string, d: string): void };
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load ' + url));
    document.head.appendChild(s);
  });
}

let cached: Translator | null = null;

/**
 * Load liblouis (German) in the browser. Returns a {@link Translator}, or null
 * on any failure so callers fall back to the built-in uncontracted translator.
 */
export async function loadLiblouisTranslator(grade: LiblouisGrade = 1): Promise<Translator | null> {
  if (cached) return cached;
  try {
    await loadScript(buildUrl); // → window.liblouisBuild (emscripten Module)
    await loadScript(easyApiUrl); // → window.liblouis (ready EasyApi instance)
    const w = window as unknown as { liblouis?: LiblouisApi; LiblouisEasyApi?: new () => LiblouisApi };
    const lib = w.liblouis ?? (w.LiblouisEasyApi ? new w.LiblouisEasyApi() : undefined);
    if (!lib) throw new Error('liblouis global not available after script load');
    const fs = lib.getFilesystem();
    try {
      fs.mkdir('/tables');
    } catch {
      /* already present */
    }
    for (const [name, content] of Object.entries(TABLES)) fs.writeFile('/tables/' + name, content);
    if (!lib.translateString('tables/unicode.dis,tables/de-de-g1.ctb', 'test')) {
      throw new Error('liblouis returned empty translation');
    }
    cached = makeLiblouisTranslator((tl, txt) => lib.translateString(tl, txt), { grade });
    return cached;
  } catch (err) {
    console.warn('[tastmap] liblouis unavailable; using placeholder braille:', err);
    return null;
  }
}
