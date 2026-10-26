// 平台感知构建:Windows 产出 portable exe,macOS 产出 arm64 dmg。
// 全部用 node 直接调本地依赖,避免跨平台 npm/.bin 差异。
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function tryRun(command, args) {
  return spawnSync(command, args, { stdio: 'inherit' }).status === 0;
}

function cleanRelease(keepExtensions) {
  if (!fs.existsSync('release')) {
    return;
  }
  for (const name of fs.readdirSync('release')) {
    if (!keepExtensions.some((extension) => name.endsWith(extension))) {
      fs.rmSync(path.join('release', name), { recursive: true, force: true });
    }
  }
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// electron-builder 的 DMG 制作依赖需从 GitHub 下载,受限网络下 404/超时;
// 此时 .app 已打包完成,回退用系统 hdiutil 本地制作 DMG。
function createDmgWithHdiutil() {
  const appDir = 'release/mac-arm64';
  const appPath = path.join(appDir, `${pkg.build.productName}.app`);
  const requiredFiles = ['Contents/Info.plist', `Contents/MacOS/${pkg.build.productName}`, 'Contents/Resources/app.asar'];
  if (requiredFiles.some((file) => !fs.existsSync(path.join(appPath, file)))) {
    console.error('hdiutil 回退失败:未找到完整的 .app 打包产物');
    process.exit(1);
  }
  // 仅允许完整、签名有效的应用回退制作 DMG,不能掩盖应用打包或签名失败。
  run('codesign', ['--verify', '--deep', '--strict', appPath]);
  const dmgPath = path.join('release', `TOList-Desktop-Pet-${pkg.version}.dmg`);
  fs.rmSync(dmgPath, { force: true });
  run('hdiutil', ['create', '-volname', pkg.build.productName, '-srcfolder', appDir, '-ov', '-format', 'UDZO', dmgPath]);
}

run(process.execPath, ['scripts/kill-app.cjs']);
cleanRelease([]); // 清空整个 release 目录
run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
run(process.execPath, ['node_modules/electron-vite/bin/electron-vite.js', 'build']);

if (process.platform === 'darwin') {
  if (!tryRun(process.execPath, ['node_modules/electron-builder/cli.js', '--mac', 'dmg', '--arm64', '--publish', 'never'])) {
    console.log('electron-builder DMG 失败,回退 hdiutil 打包');
    createDmgWithHdiutil();
  }
} else {
  run(process.execPath, ['node_modules/electron-builder/cli.js', '--win', 'portable', '--publish', 'never']);
}
cleanRelease(['.exe', '.dmg']);
