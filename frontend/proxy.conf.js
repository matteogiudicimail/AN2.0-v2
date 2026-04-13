/**
 * Angular dev-server proxy configuration (progetto root / shell).
 * Vedi projects/mesa-ui/proxy.conf.js per la documentazione completa.
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
};
