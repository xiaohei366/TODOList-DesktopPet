const { execFileSync } = require('node:child_process');
const path = require('node:path');
const pkg = require('../package.json');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WINDOWS_NAMES = [`${pkg.build.productName}.exe`, 'TOList-Desktop-Pet-0.2.2.exe'];
// 从当前项目目录定位 dev Electron,仓库改名或路径包含空格也可使用。
const electronBinary = path.resolve(__dirname, '../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const MACOS_PATTERNS = [
  `${escapeRegExp(pkg.build.productName)}\\.app/Contents/MacOS/`,
  `^${escapeRegExp(electronBinary)}( |$)`
];

function kill(command, args) {
  try {
    execFileSync(command, args, { stdio: 'pipe' });
  } catch {
    // process not running, ignore
  }
}

if (process.platform === 'win32') {
  for (const name of WINDOWS_NAMES) {
    kill('taskkill', ['/F', '/IM', name]);
  }
} else if (process.platform === 'darwin') {
  for (const pattern of MACOS_PATTERNS) {
    kill('pkill', ['-f', pattern]);
  }
}
