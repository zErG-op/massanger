import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig({
    plugins: [
        react(),
        electron({
            // Указываем Vite, где лежит главный файл Electron
            entry: 'main.js',
        }),
    ],
    base: './',
});