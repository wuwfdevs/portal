import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts', 'src/**/*.test.ts'],
    // The integration tests share one database and one of them clears the staff table, so files run one at a
    // time. (One suite failed once, right after a database restart, and did not reproduce in six reruns.)
    fileParallelism: false,
  },
})
