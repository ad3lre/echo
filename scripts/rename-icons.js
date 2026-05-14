const fs = require('fs');
const path = require('path');

// Define the absolute path to the icons directory.
// The script is in `echo/scripts`, so we go up one level and then into `frontend`.
const iconsDirectory = path.join(__dirname, '../frontend/src/assets/icons');

// This is the regular expression that will find the files to rename.
// It looks for one or more digits (\\d+) at the start (^) of the filename,
// followed by a hyphen (-).
const filePrefixRegex = /^\d+-/;

// --- Synchronous Script ---
// This version reads all files and renames them one by one, which avoids
// the race conditions that can happen with asynchronous file operations
// when multiple files might be renamed to the same thing.

try {
  console.log(`Scanning for icons to rename in: ${iconsDirectory}`);
  const files = fs.readdirSync(iconsDirectory);
  let filesRenamed = 0;

  files.forEach((file) => {
    if (filePrefixRegex.test(file)) {
      const oldPath = path.join(iconsDirectory, file);

      // Create the base new name by replacing the prefix.
      const baseName = file.replace(filePrefixRegex, '').trim();
      const extension = path.extname(baseName);
      const nameWithoutExt = path.basename(baseName, extension);

      let newName = baseName;
      let newPath = path.join(iconsDirectory, newName);
      let counter = 2;

      // If a file with the new name already exists, append a counter.
      while (fs.existsSync(newPath)) {
        newName = `${nameWithoutExt}-${counter}${extension}`;
        newPath = path.join(iconsDirectory, newName);
        counter++;
      }

      // Rename the file synchronously.
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
