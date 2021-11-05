import { exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import rimraf from 'rimraf';

const promiseExec = (command: string): Promise<{ stdout: string, stderr: string }> => {
  console.info(`Executing: ${command}`);
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      }
      else {
        console.log(stdout);
        console.error(stderr);
        resolve({ stdout, stderr });
      }
    });
  });
};

async function main (): Promise<void> {
  const docsPath = path.join(__dirname, '..', 'docs');
  rimraf.sync(docsPath);
  fs.mkdirSync(docsPath);

  const packagesPath = path.join(__dirname, '..', 'packages');
  const dirs = fs.readdirSync(packagesPath, { withFileTypes: true }).filter(dirent => dirent.isDirectory());
  for (const dir of dirs) {
    rimraf.sync(path.join(packagesPath, dir.name, 'docs'));
    await promiseExec(`yarn workspace @cisl/${dir.name} docs`);
    fs.moveSync(path.join(packagesPath, dir.name, 'docs'), path.join(docsPath, dir.name));
  }

  fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(docsPath, 'index.html'));
  fs.copyFileSync(path.join(__dirname, '.nojekyll'), path.join(docsPath, '.nojekyll'));
  fs.copySync(path.join(__dirname, '..', 'img'), path.join(docsPath, 'img'));

  fs.copySync(path.join(docsPath, 'io', 'assets'), path.join(docsPath, 'assets'));
}

main().then(() => {
  console.info('Done');
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});


