// lage-worker.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = fs.realpathSync(__dirname);
const workerCommandArgs = Object.freeze({
  build: Object.freeze(['run', 'build']),
  test: Object.freeze(['run', 'test']),
  'check-types': Object.freeze(['run', 'check-types']),
});
const workerTasks = new Set(Object.keys(workerCommandArgs));

function isWithinDirectory(root, candidate) {
  const relativePath = path.relative(root, candidate);

  return relativePath === '' || (
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function validateTarget(target) {
  if (!target || typeof target !== 'object') {
    throw new TypeError('[Worker] A valid Lage target is required.');
  }

  const { packageName, task, cwd } = target;

  if (typeof task !== 'string' || !workerTasks.has(task)) {
    throw new Error(`[Worker] Unsupported worker task: ${String(task)}.`);
  }

  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) {
    throw new Error('[Worker] The worker cwd must be an absolute path.');
  }

  let resolvedCwd;
  try {
    resolvedCwd = fs.realpathSync(cwd);
  } catch (error) {
    throw new Error('[Worker] The worker cwd does not exist or is not accessible.', { cause: error });
  }

  if (!isWithinDirectory(projectRoot, resolvedCwd)) {
    throw new Error('[Worker] The worker cwd must be inside the repository.');
  }

  let packageManifest;
  try {
    packageManifest = JSON.parse(
      fs.readFileSync(path.join(resolvedCwd, 'package.json'), 'utf8')
    );
  } catch (error) {
    throw new Error('[Worker] The worker cwd must contain a readable package.json.', { cause: error });
  }

  if (!packageManifest || typeof packageManifest.name !== 'string') {
    throw new Error('[Worker] The worker package.json must contain a name.');
  }

  if (packageName !== undefined && packageName !== packageManifest.name) {
    throw new Error('[Worker] The worker package name does not match its cwd.');
  }

  return {
    packageName: packageManifest.name,
    task,
    cwd: resolvedCwd,
  };
}

module.exports = async function(context) {
  const target = validateTarget(context?.target);
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'pnpm.cmd', ...workerCommandArgs[target.task]]
    : workerCommandArgs[target.task];

  console.log(`[Worker] Running task "${target.task}" for "${target.packageName}" in: ${target.cwd}`);

  execFileSync(command, commandArgs, {
    cwd: target.cwd,
    shell: false,
    stdio: 'inherit',
    env: {
      ...process.env,
      FORCE_COLOR: '1',
    },
  });
};
