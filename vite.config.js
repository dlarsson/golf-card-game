import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

const gitCommit = execSync('git rev-parse --short HEAD').toString().trim()

export default defineConfig({
  base: '',
  define: {
    __APP_COMMIT__: JSON.stringify(gitCommit),
  },
  build: {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
          warning.message.includes('"use client"') &&
          warning.id?.includes('/node_modules/@mantine/')
        ) {
          return
        }

        defaultHandler(warning)
      },
    },
  },
})
