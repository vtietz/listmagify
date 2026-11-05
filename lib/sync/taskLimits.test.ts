import { describe, expect, it } from 'vitest';
import { getSyncTaskLimit } from './taskLimits';

const config = {
  standardLimit: 5,
  premiumLimit: 100,
  premiumUserIds: ['spotify:premium-user', 'tidal:42'],
};

describe('getSyncTaskLimit', () => {
  it('returns the standard limit for regular users', () => {
    expect(getSyncTaskLimit(['spotify:regular-user'], config)).toBe(5);
  });

  it('returns the premium limit when any connected provider ID is allowlisted', () => {
    expect(getSyncTaskLimit(['spotify:regular-user', 'tidal:42'], config)).toBe(100);
  });

  it('supports an unlimited premium tier', () => {
    expect(getSyncTaskLimit(['spotify:premium-user'], { ...config, premiumLimit: undefined }))
      .toBeUndefined();
  });

  it('uses the standard limit when the premium allowlist is empty', () => {
    expect(getSyncTaskLimit(['spotify:premium-user'], { ...config, premiumUserIds: [] })).toBe(5);
  });

  it('never gives premium users fewer slots than standard users', () => {
    expect(getSyncTaskLimit(['spotify:premium-user'], { ...config, premiumLimit: 2 })).toBe(5);
  });

  it('keeps premium users unlimited when the standard tier is unlimited', () => {
    expect(getSyncTaskLimit(['spotify:premium-user'], { ...config, standardLimit: undefined }))
      .toBeUndefined();
  });
});
