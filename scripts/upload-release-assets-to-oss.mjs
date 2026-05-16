import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import OSS from 'ali-oss';

const config = readConfigSecret();
applyConfigEnv(config);

const requiredEnv = [
  'ALIYUN_OSS_REGION',
  'ALIYUN_OSS_BUCKET',
  'ALIYUN_OSS_ACCESS_KEY_ID',
  'ALIYUN_OSS_ACCESS_KEY_SECRET'
];

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const releaseAssetsDir = process.argv[2] ?? 'release-assets';
const prefix = normalizePrefix(process.env.ALIYUN_OSS_PREFIX || 'cool-buddy');

const client = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
  secure: true
});

const contentTypes = new Map([
  ['.yml', 'application/x-yaml; charset=utf-8'],
  ['.yaml', 'application/x-yaml; charset=utf-8'],
  ['.exe', 'application/vnd.microsoft.portable-executable'],
  ['.blockmap', 'application/octet-stream'],
  ['.dmg', 'application/x-apple-diskimage'],
  ['.zip', 'application/zip'],
  ['.AppImage', 'application/octet-stream'],
  ['.deb', 'application/vnd.debian.binary-package'],
  ['.snap', 'application/octet-stream']
]);

const files = await collectFiles(releaseAssetsDir);

if (files.length === 0) {
  throw new Error(`No release assets found in ${releaseAssetsDir}`);
}

for (const filePath of files) {
  const objectKey = joinObjectKey(prefix, basename(filePath));
  const headers = createHeaders(filePath);

  await client.putStream(objectKey, createReadStream(filePath), { headers });
  console.log(`Uploaded ${filePath} -> oss://${process.env.ALIYUN_OSS_BUCKET}/${objectKey}`);
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileStat = await stat(fullPath);
    if (fileStat.size > 0) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function createHeaders(filePath) {
  const fileName = basename(filePath);
  const extension = fileName.endsWith('.AppImage') ? '.AppImage' : extname(fileName);
  const headers = {
    'Content-Type': contentTypes.get(extension) ?? 'application/octet-stream'
  };

  if (fileName === 'latest.yml' || fileName === 'latest-mac.yml' || fileName === 'latest-linux.yml') {
    headers['Cache-Control'] = 'no-cache';
  } else {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }

  return headers;
}

function normalizePrefix(value) {
  return value.replace(/^\/+|\/+$/g, '');
}

function joinObjectKey(...parts) {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/');
}

function readConfigSecret() {
  const rawConfig = process.env.ALIYUN_OSS_CONFIG || process.env.OSS;

  if (!rawConfig) {
    return {};
  }

  try {
    return JSON.parse(rawConfig);
  } catch {
    return rawConfig
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .reduce((values, line) => {
        const separatorIndex = line.indexOf('=');

        if (separatorIndex === -1) {
          return values;
        }

        values[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1).trim();
        return values;
      }, {});
  }
}

function applyConfigEnv(config) {
  const mappings = [
    ['ALIYUN_OSS_REGION', 'region'],
    ['ALIYUN_OSS_BUCKET', 'bucket'],
    ['ALIYUN_OSS_ACCESS_KEY_ID', 'accessKeyId', 'access_key_id'],
    ['ALIYUN_OSS_ACCESS_KEY_SECRET', 'accessKeySecret', 'access_key_secret'],
    ['ALIYUN_OSS_PREFIX', 'prefix']
  ];

  for (const [envName, ...configKeys] of mappings) {
    if (process.env[envName]) {
      continue;
    }

    const value = [config[envName], ...configKeys.map((key) => config[key])].find(
      (item) => typeof item === 'string' && item.trim()
    );

    if (value) {
      process.env[envName] = value.trim();
    }
  }
}
