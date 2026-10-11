/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./src/version.json', import.meta.url), 'utf-8'));

// The Sandbox panel of nakomis-shell, served from app.sandbox.nakomis.com/remotes/sandbox/.
// Sandbox-only by design: there is no prod deployment.
export default defineConfig(({ command }) => ({
    base: command === 'build' ? '/remotes/sandbox/' : '/',
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [
        react(),
        federation({
            name: 'sandbox',
            filename: 'remoteEntry.js',
            exposes: { './App': './src/ShellApp.tsx' },
            shared: {
                react: { singleton: true },
                'react-dom': { singleton: true },
            },
            dts: false,
        }),
    ],
    build: { target: 'es2022' },
    server: { port: 5175, origin: 'http://localhost:5175' },
    test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
}));
