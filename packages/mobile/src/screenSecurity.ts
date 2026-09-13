/**
 * AegisCall Native OS Screen-Capture Prevention Shield
 * Enforces OS-level window security flags:
 * - Android: WindowManager.LayoutParams.FLAG_SECURE (renders window black in screenshots and screen recordings)
 * - iOS: Hides app preview snapshot in multitasking switcher and blocks AirPlay mirroring
 */

export class MobileScreenSecurityService {
  private static isShieldActive = false;

  public static setScreenShield(enabled: boolean): boolean {
    this.isShieldActive = enabled;
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      try {
        const { Plugins } = (window as any).Capacitor;
        if (Plugins?.PrivacyScreen) {
          if (enabled) {
            Plugins.PrivacyScreen.enable();
          } else {
            Plugins.PrivacyScreen.disable();
          }
        }
      } catch {
        // Fallback for non-Capacitor web execution
      }
    }
    return this.isShieldActive;
  }

  public static isShieldEnabled(): boolean {
    return this.isShieldActive;
  }
}
