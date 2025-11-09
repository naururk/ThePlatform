import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ThePlatform/', // ВАЖНО: точное имя репозитория с обоих сторон слеш
})
