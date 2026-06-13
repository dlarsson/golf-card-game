import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

const gitCommit = execSync('git rev-parse --short HEAD').toString().trim()

export default defineConfig({
  base: '',
  define: {
    __APP_COMMIT__: JSON.stringify(gitCommit),
  },
})
