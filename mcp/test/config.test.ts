import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies defaults on an empty env', () => {
    expect(loadConfig({})).toEqual({
      apiUrl: 'http://localhost:3001',
      runWaitMs: 600_000,
      pollIntervalMs: 5_000,
      httpTimeoutMs: 30_000,
    });
  });

  it('reads overrides, strips trailing slashes, treats empty strings as unset', () => {
    const cfg = loadConfig({
      DEVDIGEST_API_URL: 'https://api.example.test:8443/',
      DEVDIGEST_RUN_WAIT_MS: '0',
      DEVDIGEST_POLL_INTERVAL_MS: '',
      DEVDIGEST_HTTP_TIMEOUT_MS: '2000',
    });
    expect(cfg).toEqual({
      apiUrl: 'https://api.example.test:8443',
      runWaitMs: 0,
      pollIntervalMs: 5_000,
      httpTimeoutMs: 2_000,
    });
  });

  it.each([
    ['DEVDIGEST_API_URL', 'ftp://x.test'],
    ['DEVDIGEST_API_URL', 'not a url'],
    ['DEVDIGEST_RUN_WAIT_MS', '1800001'],
    ['DEVDIGEST_RUN_WAIT_MS', 'abc'],
    ['DEVDIGEST_POLL_INTERVAL_MS', '999'],
    ['DEVDIGEST_POLL_INTERVAL_MS', '60001'],
    ['DEVDIGEST_HTTP_TIMEOUT_MS', '1.5'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => loadConfig({ [key]: value })).toThrow(ConfigError);
  });
});
