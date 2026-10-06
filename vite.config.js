import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The economic calendar feed sends no CORS headers, so the browser reaches it through a same-origin path
// (vercel.json rewrites the same path in production).
const calendarProxy = {
  '/api/calendar': {
    target: 'https://nfs.faireconomy.media',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/calendar\/(thisweek)$/, '/ff_calendar_$1.json'),
  },
}

export default defineConfig({ plugins: [react()], server: { proxy: calendarProxy }, preview: { proxy: calendarProxy } })
