import fs from 'fs/promises';
import path from 'path';

const root = path.resolve(process.cwd(), '.diagnostics/sessions');

async function main() {
  try {
    const dirs = await fs.readdir(root, { withFileTypes: true });
    const sessions = dirs
      .filter((d) => d.isDirectory() && d.name.startsWith('session_'))
      .map((d) => d.name)
      .sort();
    const latest = sessions[sessions.length - 1];
    if (!latest) {
      process.stdout.write('No diagnostics sessions found.\n');
      process.exit(1);
    }
    process.stdout.write(`${path.join(root, latest)}\n`);
  } catch (e) {
    process.stderr.write(
      `Failed to resolve latest diagnostics session: ${String(e)}\n`,
    );
    process.exit(1);
  }
}

main();
