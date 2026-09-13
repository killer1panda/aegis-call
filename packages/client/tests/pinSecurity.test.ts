import { describe, it, expect, beforeEach } from 'vitest';
import { PinSecurityService } from '../src/services/pinSecurityService.js';

describe('AegisCall PinSecurityService (User-Configurable Master & Duress PINs)', () => {
  let pinService: PinSecurityService;

  beforeEach(() => {
    pinService = PinSecurityService.getInstance();
    pinService.resetToDefaults();
  });

  it('should authenticate default factory PINs when unconfigured', () => {
    expect(pinService.isCustomized()).toBe(false);

    // Default Master PIN
    expect(pinService.verifyPin('1337')).toEqual({ status: 'master' });
    expect(pinService.verifyPin('0000')).toEqual({ status: 'master' });

    // Default Duress PIN
    expect(pinService.verifyPin('9999')).toEqual({ status: 'duress' });

    // Arbitrary invalid PINs
    expect(pinService.verifyPin('1234')).toEqual({ status: 'invalid' });
    expect(pinService.verifyPin('8888')).toEqual({ status: 'invalid' });
    expect(pinService.verifyPin('12')).toEqual({ status: 'invalid' });
    expect(pinService.verifyPin('')).toEqual({ status: 'invalid' });
  });

  it('should reject PIN updates when current master PIN is incorrect', () => {
    const result = pinService.updatePins('wrong-pin', '2468', '1357');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Current Master PIN is incorrect');
  });

  it('should reject PIN updates when master and duress PINs collide', () => {
    const result = pinService.updatePins('1337', '5555', '5555');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Master PIN and Duress PIN must be different');
  });

  it('should reject PINs that fail digit length constraints (4 to 8 digits)', () => {
    const shortMaster = pinService.updatePins('1337', '12', '9876');
    expect(shortMaster.success).toBe(false);
    expect(shortMaster.error).toContain('between 4 and 8 digits');

    const longDuress = pinService.updatePins('1337', '1234', '123456789');
    expect(longDuress.success).toBe(false);
    expect(longDuress.error).toContain('between 4 and 8 digits');
  });

  it('should successfully update to custom user PINs and purge old credentials', () => {
    const updateResult = pinService.updatePins('1337', '4321', '8765');
    expect(updateResult.success).toBe(true);
    expect(pinService.isCustomized()).toBe(true);

    // New custom Master PIN authenticates
    expect(pinService.verifyPin('4321')).toEqual({ status: 'master' });

    // New custom Duress PIN authenticates
    expect(pinService.verifyPin('8765')).toEqual({ status: 'duress' });

    // Old default PINs no longer work
    expect(pinService.verifyPin('1337')).toEqual({ status: 'invalid' });
    expect(pinService.verifyPin('9999')).toEqual({ status: 'invalid' });
    expect(pinService.verifyPin('0000')).toEqual({ status: 'invalid' });
  });

  it('should restore factory defaults upon explicit reset', () => {
    pinService.updatePins('1337', '4321', '8765');
    expect(pinService.verifyPin('4321')).toEqual({ status: 'master' });

    pinService.resetToDefaults();
    expect(pinService.isCustomized()).toBe(false);

    expect(pinService.verifyPin('1337')).toEqual({ status: 'master' });
    expect(pinService.verifyPin('9999')).toEqual({ status: 'duress' });
    expect(pinService.verifyPin('4321')).toEqual({ status: 'invalid' });
  });
});
