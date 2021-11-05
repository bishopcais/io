import fs from 'fs';
import path from 'path';

const basePackageJson = JSON.parse(fs.readFileSync(path.join(
  __dirname,
  '../package.json',
), 'utf8')) as { version: string };

const version = basePackageJson.version;

const packagesPath = path.join(__dirname, '..', 'packages' );
const dirs = fs.readdirSync(packagesPath, { withFileTypes: true});

for (const dir of dirs) {
  if (!dir.isDirectory()) {
    continue;
  }
  const packageJsonPath = path.join(packagesPath, dir.name, 'package.json');
  const packageJson = fs.readFileSync(packageJsonPath, 'utf8');
  console.info(`Updating ${dir.name}...`);
  fs.writeFileSync(packageJsonPath, packageJson.replace(/"version": "([0-9a-z\-.]+)"/, `"version": "${version}"`));
}
