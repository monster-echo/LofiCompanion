// Resolves bundler-style imports for the bare-Node WS process, which does not
// read tsconfig paths or add `.ts` extensions on its own (twin of
// tests/loader.mjs; lives one level deeper, hence `../../`):
//   `@/foo/bar`            -> `src/foo/bar.ts`
//   `./baz` / `../baz`     -> append `.ts` (relative, no extension)
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname, resolve as pathResolve } from 'node:path';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

function hasExtension(specifier) {
  return specifier.split('/').pop().includes('.');
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = join(projectRoot, 'src', `${specifier.slice(2)}.ts`);
    return nextResolve(pathToFileURL(target).href, context);
  }
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !hasExtension(specifier)
  ) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : projectRoot;
    const target = pathResolve(dirname(parent), `${specifier}.ts`);
    return nextResolve(pathToFileURL(target).href, context);
  }
  return nextResolve(specifier, context);
}
