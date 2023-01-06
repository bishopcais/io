const path = require('path');
const { lstatSync, readdirSync } = require('fs');
// get listing of packages in the mono repo
const basePath = path.resolve(__dirname, 'packages');
const packages = readdirSync(basePath).filter(name => {
  return lstatSync(path.join(basePath, name)).isDirectory();
});

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: [
    'packages/io/src/**/*.{ts,tsx}',
    '!tests/',
  ],
  coverageReporters: ['text'],
  moduleNameMapper: {
    ...packages.reduce(
      (acc, name) => ({
        ...acc,
        [`@cisl/${name}(.*)$`]:
        `<rootDir>/packages/./${name}/src/$1`,
      }),
      {},
    ),
  },
  modulePathIgnorePatterns: ['<rootDir>/packages/.*/dist/'],
};
