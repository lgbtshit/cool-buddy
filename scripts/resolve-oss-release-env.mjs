import { appendFileSync } from 'node:fs';

const config = readConfigSecret();

const resolved = {
  ELECTRON_UPDATER_URL: firstValue(
    process.env.ELECTRON_UPDATER_URL,
    config.ELECTRON_UPDATER_URL,
    config.electronUpdaterUrl,
    config.updateUrl,
    config.url
  ),
  ALIYUN_OSS_REGION: firstValue(
    process.env.ALIYUN_OSS_REGION,
    config.ALIYUN_OSS_REGION,
    config.region
  ),
  ALIYUN_OSS_BUCKET: firstValue(
    process.env.ALIYUN_OSS_BUCKET,
    config.ALIYUN_OSS_BUCKET,
    config.bucket
  ),
  ALIYUN_OSS_ACCESS_KEY_ID: firstValue(
    process.env.ALIYUN_OSS_ACCESS_KEY_ID,
    config.ALIYUN_OSS_ACCESS_KEY_ID,
    config.accessKeyId,
    config.access_key_id
  ),
  ALIYUN_OSS_ACCESS_KEY_SECRET: firstValue(
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
    config.ALIYUN_OSS_ACCESS_KEY_SECRET,
    config.accessKeySecret,
    config.access_key_secret
  ),
  ALIYUN_OSS_PREFIX: firstValue(
    process.env.ALIYUN_OSS_PREFIX,
    config.ALIYUN_OSS_PREFIX,
    config.prefix,
    'cool-buddy'
  )
};

const required = [
  'ELECTRON_UPDATER_URL',
  'ALIYUN_OSS_REGION',
  'ALIYUN_OSS_BUCKET',
  'ALIYUN_OSS_ACCESS_KEY_ID',
  'ALIYUN_OSS_ACCESS_KEY_SECRET'
];

for (const name of required) {
  if (!resolved[name]) {
    throw new Error(`Missing release environment value: ${name}`);
  }
}

if (process.env.GITHUB_ENV) {
  appendFileSync(
    process.env.GITHUB_ENV,
    Object.entries(resolved)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'
  );
}

console.log(`Resolved update URL: ${resolved.ELECTRON_UPDATER_URL}`);
console.log(`Resolved OSS target: oss://${resolved.ALIYUN_OSS_BUCKET}/${resolved.ALIYUN_OSS_PREFIX}`);

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

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        values[key] = value;
        return values;
      }, {});
  }
}

function firstValue(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}
