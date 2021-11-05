import fs from 'fs-extra';
import path from 'path';

const tmpDir = path.join(__dirname, 'tmp');
const baseDir = process.cwd();
const basename = path.basename(baseDir);

try {
  fs.mkdirSync(tmpDir);
  fs.moveSync(path.join(baseDir, 'dist', basename, 'src'), path.join(tmpDir, basename));
  fs.removeSync(path.join(baseDir, 'dist'));
  fs.readdirSync(path.join(tmpDir, basename)).forEach((file) => {
    fs.moveSync(path.join(tmpDir, basename, file), path.join(baseDir, 'dist', file));
  });
}
finally {
  fs.removeSync(tmpDir);
}

