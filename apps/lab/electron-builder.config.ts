import { Configuration } from 'electron-builder';

const config: Configuration = {
  appId: 'dev.oaslananka.mcp-lab',
  productName: 'MCP Lab',
  directories: {
    output: 'release',
    buildResources: 'resources'
  },
  files: [
    'dist/**/*',
    'package.json'
  ],
  mac: {
    target: ['dmg'],
    hardenedRuntime: true,
    category: 'public.app-category.developer-tools'
  },
  win: {
    target: ['nsis']
  },
  linux: {
    target: ['AppImage', 'deb'],
    category: 'Development'
  },
  publish: [
    {
      provider: 'github',
      owner: 'oaslananka',
      repo: 'mcp-suite'
    }
  ]
};

export default config;
