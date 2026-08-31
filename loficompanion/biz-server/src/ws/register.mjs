// Preload entry: registers the `@/*` alias resolver before the WS server
// loads modules (twin of tests/register.mjs).
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);
