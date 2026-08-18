import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(
  new URL('../../package.json', import.meta.url),
  'utf8',
));
const packageLock = JSON.parse(await readFile(
  new URL('../../package-lock.json', import.meta.url),
  'utf8',
));
const packages = packageLock.packages;

function versionAtLeast(version, minimum) {
  const current = version.split('.').map(Number);
  const required = minimum.split('.').map(Number);
  for (let index = 0; index < Math.max(current.length, required.length); index++) {
    if ((current[index] ?? 0) > (required[index] ?? 0)) return true;
    if ((current[index] ?? 0) < (required[index] ?? 0)) return false;
  }
  return true;
}

function copiesOf(packageName) {
  return Object.entries(packages)
    .filter(([path]) => path.endsWith(`node_modules/${packageName}`))
    .map(([, metadata]) => metadata);
}

test('Netlify Functions uses the release without direct extract-zip exposure', () => {
  assert.match(packageJson.devDependencies['@netlify/functions'], /^\^5\./);
  const functionsPackage = packages['node_modules/@netlify/functions'];
  assert.ok(versionAtLeast(functionsPackage.version, '5.3.0'));
  assert.equal(functionsPackage.dependencies?.['extract-zip'], undefined);
});

test('Netlify image tooling resolves patched sharp and no vulnerable image-size', () => {
  assert.equal(packageJson.overrides.sharp, '0.35.3');
  assert.equal(packageJson.overrides['@netlify/dev-utils'], '5.0.0');
  const sharpCopies = copiesOf('sharp');
  const devUtilsCopies = copiesOf('@netlify/dev-utils');
  assert.ok(sharpCopies.length > 0);
  assert.ok(sharpCopies.every(({ version }) => versionAtLeast(version, '0.35.0')));
  assert.ok(devUtilsCopies.every(({ version }) => versionAtLeast(version, '5.0.0')));
  assert.equal(copiesOf('image-size').length, 0);
});

test('all installed Netlify blobs copies meet the patched baseline', () => {
  const blobCopies = copiesOf('@netlify/blobs');

  assert.ok(blobCopies.length > 0);
  assert.ok(blobCopies.every(({ version }) => versionAtLeast(version, '10.7.13')));
});

test('unpatched extract-zip stays isolated to Netlify local development', () => {
  const parents = Object.entries(packages)
    .filter(([, metadata]) => metadata.dependencies?.['extract-zip'])
    .map(([path]) => path);

  assert.ok(parents.every(path => path === 'node_modules/@netlify/functions-dev'));
  assert.equal(packageJson.dependencies?.['extract-zip'], undefined);
  assert.equal(packageJson.devDependencies?.['extract-zip'], undefined);
});

test('Netlify CLI is not downgraded to the unsafe npm audit recommendation', () => {
  assert.match(packageJson.devDependencies['netlify-cli'], /^\^27\./);
  assert.ok(versionAtLeast(packages['node_modules/netlify-cli'].version, '27.1.1'));
});
