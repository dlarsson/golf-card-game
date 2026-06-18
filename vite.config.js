import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

const gitCommit = execSync('git rev-parse --short HEAD').toString().trim()
const gitCommitMessage = execSync('git log -1 --pretty=%s').toString().trim()

export default defineConfig({
  base: '',
  define: {
    __APP_COMMIT__: JSON.stringify(gitCommit),
    __APP_COMMIT_MESSAGE__: JSON.stringify(gitCommitMessage),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/locales/')) return `locale-${id.split('/').pop().replace(/\.[^.]+$/, '')}`
          if (id.includes('/src/games/')) return `game-${id.split('/').pop().replace(/\.[^.]+$/, '')}`
          if (id.includes('/node_modules/@mantine/')) return 'mantine'
          if (id.includes('/node_modules/peerjs/')) return 'peerjs'
          if (id.includes('/node_modules/')) return 'vendor'
        },
      },
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
