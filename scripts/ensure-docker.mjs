import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execP = promisify(exec);

const PLATFORM = process.platform;
const START_TIMEOUT = 120_000;
const POLL_INTERVAL = 2000;

async function dockerIsReady() {
  try {
    await execP('docker info', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function tryStartDocker() {
  if (PLATFORM === 'win32') {
    const possible = [
      `"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"`,
      `"C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe"`,
    ];
    for (const p of possible) {
      try {
        await execP(`start "" ${p}`);
        return true;
      } catch {
        // continue trying other paths
      }
    }
    try {
      await execP('wsl -l -v', { timeout: 5000 });
      await execP('wsl -d docker-desktop', { timeout: 5000 }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  } else if (PLATFORM === 'darwin') {
    try {
      await execP('open -a Docker');
      return true;
    } catch {
      return false;
    }
  } else {
    try {
      await execP('systemctl start docker', { timeout: 5000 });
      return true;
    } catch {
      try {
        await execP('service docker start', { timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    }
  }
}

async function waitForDocker(timeoutMs = START_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await dockerIsReady()) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    process.stdout.write('.');
  }
  return false;
}

async function main() {
  process.stdout.write('Checking for Docker... ');
  if (await dockerIsReady()) {
    console.log('available.');
    return 0;
  }

  console.log('not available. Attempting to start Docker...');
  const started = await tryStartDocker();
  if (!started) {
    console.error(
      'Could not automatically start Docker on this system. Please start Docker Desktop (or the Docker daemon) and re-run npm.',
    );
    process.exit(1);
  }

  process.stdout.write('Waiting for Docker to become ready');
  const ready = await waitForDocker();
  if (!ready) {
    console.error(
      `\nTimed out waiting ${START_TIMEOUT / 1000}s for Docker to become ready. Please start Docker and try again.`,
    );
    process.exit(1);
  }

  console.log('\nDocker is ready.');
  return 0;
}

main().catch((err) => {
  console.error(
    'Error checking/starting Docker:',
    err && err.message ? err.message : err,
  );
  process.exit(1);
});
