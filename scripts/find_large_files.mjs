import fs from 'node:fs';
import path from 'node:path';

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (!fullPath.includes('node_modules')) {
        results = results.concat(getFiles(fullPath));
      }
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.vue')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n').length;
      results.push({ path: fullPath, lines });
    }
  });
  return results;
}

const backendFiles = getFiles('backend/src');
const frontendFiles = getFiles('frontend/src');
const allFiles = [...backendFiles, ...frontendFiles];

allFiles.sort((a, b) => b.lines - a.lines);

console.log('Lines\tFile');
allFiles.slice(0, 30).forEach((f) => {
  console.log(`${f.lines}\t${f.path}`);
});
