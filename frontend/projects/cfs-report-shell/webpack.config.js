const { shareAll, withModuleFederationPlugin } = require('@angular-architects/module-federation/webpack');

module.exports = withModuleFederationPlugin({

  name: 'cfs-report-shell',

  exposes: {
    // Remote entry for MESAPPA host to load CfsReportModule
    './CfsReportModule': './projects/cfs-report/src/public-api.ts',
  },

  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },

});
