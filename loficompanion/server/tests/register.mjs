// Preload entry: registers the `@/*` alias resolver before tests load modules.
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);
