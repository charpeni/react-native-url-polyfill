const detoxConfig = require('../../detox/.detoxrc.js');
const {mergeDetoxConfig} = require('../../detox/mergeDetoxConfig.js');

/** @type {Detox.DetoxConfig} */
module.exports = mergeDetoxConfig(detoxConfig, {
  devices: {
    simulator: {
      device: {
        type: 'iPhone 16 Pro',
      },
    },
  },
});
