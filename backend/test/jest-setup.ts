// Load .env.test BEFORE any module imports so that ConfigModule
// (which uses dotenv with "do not overwrite" semantics) picks up
// our test-specific values.
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env.test'),
});
