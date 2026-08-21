import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDirectory = path.join(
  __dirname,
  '../../../clients/web/src/assets/icons',
);
const filePrefixRegex = /^\d+-/;

try {
  console.log(`Scanning for icons to rename in: ${iconsDirectory}`);
  const files = fs.readdirSync(iconsDirectory);
  let filesRenamed = 0;

  files.forEach((file) => {
    if (filePrefixRegex.test(file)) {
      const oldPath = path.join(iconsDirectory, file);
      const baseName = file.replace(filePrefixRegex, '').trim();
      const extension = path.extname(baseName);
      const nameWithoutExt = path.basename(baseName, extension);

      let newName = baseName;
      let newPath = path.join(iconsDirectory, newName);
      let counter = 2;

      while (fs.existsSync(newPath)) {
        newName = `${nameWithoutExt}-${counter}${extension}`;
        newPath = path.join(iconsDirectory, newName);
        counter++;
      }

      fs.renameSync(oldPath, newPath);
      console.log(`✅ Renamed: ${file} -> ${newName}`);
      filesRenamed++;
    }
  });

  console.log(
    `\n✨ Renaming process complete. ${filesRenamed} files were renamed.`,
  );
} catch (err) {
  console.error(`❌ An error occurred: ${err.message}`);
}
