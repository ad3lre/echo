import path from 'path';
import 'dotenv/config';

/**
 * Legacy helper script — not the canonical release gate.
 *
 * For a clean, CI-aligned build from the monorepo root (recommended before any deploy):
 *   npm run ship:verify
 *
 * That runs `npm ci`, full workspace `npm run build`, and a short `/api/v1/health` smoke test.
 * Use your platform’s deploy (Docker, systemd, PM2, K8s, etc.) after artifacts exist.
 */

const ROOT_DIR = path.resolve(__dirname, '..');

async function runCommand(command: string, args: string[], cwd: string) {
  const { execa } = await import('execa');
  console.log(`Executing: ${command} ${args.join(' ')} in ${cwd}`);
  try {
    const { stdout, stderr } = await execa(command, args, { cwd });
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error: unknown) {
    const err = error as { message?: string; stderr?: string };
    console.error(`Command failed in ${cwd}: ${err.message}`);
    if (err.stderr) console.error(`stderr: ${err.stderr}`);
    process.exit(1);
  }
}

async function deploy() {
  console.log('Starting deployment process...');
  console.warn(
    '\nPrefer `npm run ship:verify` from the repo root for install + build + smoke.\n',
  );

  console.log(
    '\n--- Installing dependencies (monorepo root; required for workspace hoisting) ---',
  );
  await runCommand('npm', ['install'], ROOT_DIR);

  console.log('\n--- Building Frontend ---');
  await runCommand('npm', ['run', 'build', '-w', 'frontend'], ROOT_DIR);
  console.log('Frontend build complete.');

  console.log('\n--- Building Backend ---');
  await runCommand('npm', ['run', 'build', '-w', 'backend'], ROOT_DIR);
  console.log('Backend build complete.');

  console.log('\n--- Deploying to Target Environment ---');

  const DEPLOY_ENV = process.env.DEPLOY_ENV || 'local';

  switch (DEPLOY_ENV) {
    case 'local':
      console.log(
        'Local deployment detected. Assuming build artifacts are ready.',
      );
      console.log(
        'You can now run `npm start` from the repo root or `npm -w backend start` and serve the frontend build.',
      );
      break;
    case 'docker':
      console.log('Building Docker images...');
      break;
    case 'pm2':
      console.log('Deploying with PM2...');
      break;
    case 'vercel':
      console.log('Deploying frontend to Vercel...');
      break;
    case 'netlify':
      console.log('Deploying frontend to Netlify...');
      break;
    default:
      console.log(
        `No specific deployment strategy for environment: ${DEPLOY_ENV}`,
      );
      console.log(
        'Please implement your deployment steps for this environment.',
      );
  }

  console.log('\nDeployment process completed successfully!');
}

deploy().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
