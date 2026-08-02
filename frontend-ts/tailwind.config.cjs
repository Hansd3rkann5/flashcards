const path = require('node:path');
const repoRoot = path.resolve(__dirname, '..');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(repoRoot, 'index.html'),
    path.join(repoRoot, 'js/**/*.js'),
    path.join(__dirname, 'app/**/*.{ts,tsx,html}'),
    path.join(__dirname, 'components/**/*.{ts,tsx,html}'),
    path.join(__dirname, 'features/**/*.{ts,tsx,html}'),
    path.join(__dirname, 'hooks/**/*.{ts,tsx,html}'),
    path.join(__dirname, 'lib/**/*.{ts,tsx,html}'),
    path.join(__dirname, 'types/**/*.{ts,tsx,html}')
  ],
  theme: {
    extend: {}
  },
  corePlugins: {
    preflight: false
  }
};
