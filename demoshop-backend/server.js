const path = require('node:path');
const dotenv = require('dotenv');

// Load ignored local env files as a fallback for native development. Explicit
// process variables (Phase, CI, or an IDE run configuration) win because
// dotenv does not override values that are already present.
[
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '.env'),
].forEach((envPath) => {
    dotenv.config({ path: envPath, quiet: true });
});

// Environment is resolved and validated once by the immutable config snapshot.
const { config } = require('./src/config/env');
const appModule = require('./src/app');
const app = appModule.default || appModule;

if (!config.runtime.isProduction && !config.runtime.isTest) {
    app.listen(config.runtime.port, () => {
        console.log(`[Backend] Started successfully at http://localhost:${config.runtime.port}`);
    });
    const { queueRepository } = require('./src/repositories/queue.repository');
    queueRepository.ensureColumns().catch((err) => {
        console.warn('[Backend] ensureColumns initialization warning:', err.message);
    });
}

// Export app for Vercel and tests.
module.exports = app;
