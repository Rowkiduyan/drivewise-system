import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Dev-server only -- Chrome/Safari won't treat a PWA (manifest.json,
    // standalone display) as installable over plain HTTP unless the origin
    // is exactly "localhost". Testing "Add to Home Screen" from a phone on
    // the same WiFi means reaching this machine by LAN IP instead, which
    // Chrome treats as insecure regardless of how correct the manifest is
    // -- the install falls back to a plain bookmark shortcut that still
    // shows the address bar. This plugin serves the dev server over a
    // locally-trusted self-signed HTTPS cert instead, so a phone visiting
    // https://<this-machine's-LAN-IP>:5173 gets real installable-PWA
    // treatment (after accepting the one-time certificate warning).
    // Production builds are unaffected -- real hosting provides real HTTPS.
    command === 'serve' && basicSsl(),
  ].filter(Boolean),
  server: {
    // Binds to all network interfaces (not just localhost) so a phone on
    // the same WiFi can reach this machine by its LAN IP.
    host: true,
  },
}))
