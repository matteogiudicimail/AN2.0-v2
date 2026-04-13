/**
 * Angular dev-server proxy configuration.
 *
 * La porta del backend si legge (in ordine di priorità):
 *   1. Variabile d'ambiente BACKEND_PORT  (es. BACKEND_PORT=3001 ng serve ...)
 *   2. Default: 3000 (valore in backend/.env PORT=3000)
 *
 * Per cambiare la porta senza toccare questo file:
 *   set BACKEND_PORT=3001   (Windows CMD)
 *   $env:BACKEND_PORT=3001  (PowerShell)
 *   BACKEND_PORT=3001       (bash/zsh)
 * poi riavviare `ng serve`.
 */
const port   = process.env.BACKEND_PORT || 3000;
const target = `http://localhost:${port}`;

module.exports = {
  '/api': {
    target,
    secure:       false,
    changeOrigin: true,
    logLevel:     'info',
  },
  '/cfs-api': {
    target,
    secure:       false,
    changeOrigin: true,
    logLevel:     'info',
    pathRewrite:  { '^/cfs-api': '/api' },
  },
};
