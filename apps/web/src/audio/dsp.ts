/**
 * Loads the Rust DSP core (dsp.wasm). The module is compiled once on the
 * main thread and handed to AudioWorklets, which instantiate it synchronously.
 */
let modulePromise: Promise<WebAssembly.Module> | null = null;

export function dspModule(): Promise<WebAssembly.Module> {
  if (!modulePromise) {
    const url = `${import.meta.env.BASE_URL}dsp.wasm`;
    modulePromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load ${url} (${r.status}). Run "npm run build:wasm".`);
        return r.arrayBuffer();
      })
      .then((bytes) => WebAssembly.compile(bytes));
    modulePromise.catch(() => {
      modulePromise = null;
    });
  }
  return modulePromise;
}
