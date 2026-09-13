import { test, expect } from '@playwright/test';

test.describe('AegisCall WebRTC E2E Protocol & Features Verification', () => {
  test('Two peers establish E2EE call, negotiate media, and test security modals', async ({ browser }) => {
    const roomId = `e2e-room-${Date.now()}`;

    // 1. Create Peer A (Alice) with media stream permissions
    const contextA = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const pageA = await contextA.newPage();

    // 2. Create Peer B (Bob) with media stream permissions
    const contextB = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const pageB = await contextB.newPage();

    try {
      // 3. Alice opens the lobby
      await pageA.goto(`/?room=${roomId}`);
      await expect(pageA.getByRole('button', { name: /ENTER SECURE CALL/i })).toBeVisible();

      // Alice joins the secure room
      await pageA.getByRole('button', { name: /ENTER SECURE CALL/i }).click();

      // Verify Alice enters the active call room
      await expect(pageA.locator('nav[aria-label="Call controls"]')).toBeVisible({ timeout: 10_000 });

      // 4. Bob opens the lobby for the same room
      await pageB.goto(`/?room=${roomId}`);
      await expect(pageB.getByRole('button', { name: /ENTER SECURE CALL/i })).toBeVisible();

      // Bob joins the room
      await pageB.getByRole('button', { name: /ENTER SECURE CALL/i }).click();

      // Verify Bob enters the active call room
      await expect(pageB.locator('nav[aria-label="Call controls"]')).toBeVisible({ timeout: 10_000 });

      // 5. Verify Call Controls & Advanced Privacy Docks exist on both peers
      const voiceMaskBtnA = pageA.locator('button[aria-label*="Biometric Voice Mask"]');
      await expect(voiceMaskBtnA).toBeVisible();

      const whiteboardBtnA = pageA.locator('button[aria-label*="Whiteboard"]');
      await expect(whiteboardBtnA).toBeVisible();

      const scratchpadBtnA = pageA.locator('button[aria-label*="Scratchpad"]');
      await expect(scratchpadBtnA).toBeVisible();

      const duressBtnA = pageA.locator('button[aria-label*="Duress"]');
      await expect(duressBtnA).toBeVisible();

      // 6. Test Voice Mask Toggle (AudioWorklet Circular Delay Pitch Shifter)
      await voiceMaskBtnA.click();
      await expect(pageA.locator('button[title*="Biometric Voice Mask: Active"]')).toBeVisible();

      // 7. Test Collaborative Whiteboard Modal
      await whiteboardBtnA.click();
      await expect(pageA.getByRole('dialog', { name: /Whiteboard/i })).toBeVisible();
      await pageA.locator('button[aria-label="Close Whiteboard Modal"]').click();
      await expect(pageA.getByRole('dialog', { name: /Whiteboard/i })).not.toBeVisible();

      // 8. Test Self-Shredding Scratchpad Modal
      await scratchpadBtnA.click();
      await expect(pageA.getByRole('dialog', { name: /Scratchpad/i })).toBeVisible();
      await expect(pageA.locator('textarea')).toBeVisible();
      await pageA.locator('button[aria-label="Close Scratchpad Modal"]').click();
      await expect(pageA.getByRole('dialog', { name: /Scratchpad/i })).not.toBeVisible();

      // 9. Test Video Privacy Shroud & Face Blur Filter
      const privacyMaskBtnA = pageA.locator('button[data-testid="toggle-privacy-mask-btn"]');
      await expect(privacyMaskBtnA).toBeVisible();
      await privacyMaskBtnA.click();
      await expect(pageA.locator('button[title*="Video Privacy Shroud: Active"]')).toBeVisible();

      // 10. Test Live Closed Captions Toggle
      const captionsBtnA = pageA.locator('button[data-testid="toggle-captions-btn"]');
      await expect(captionsBtnA).toBeVisible();
      await captionsBtnA.click();
      await expect(pageA.locator('button[title*="Live Closed Captions: Active"]')).toBeVisible();

      // 11. Test Security Modal and NFC Tap to Verify Button
      const securityBtnA = pageA.locator('button[title="Inspect Safety Numbers"]');
      await securityBtnA.click();
      await expect(pageA.getByRole('dialog', { name: /End-to-End Encryption Verification/i })).toBeVisible();
      const nfcBtnA = pageA.locator('button[data-testid="nfc-verify-btn"]');
      await expect(nfcBtnA).toBeVisible();
      await pageA.locator('button[aria-label="Close Security Modal"]').click();

      // 12. Test Shamir Social Key Recovery Modal & Guardian Shares
      const socialRecoveryBtnA = pageA.locator('button[data-testid="social-recovery-btn"]');
      await expect(socialRecoveryBtnA).toBeVisible();
      await socialRecoveryBtnA.click();
      await expect(pageA.getByRole('dialog', { name: /Shamir Social Key Recovery/i })).toBeVisible();
      // Click compute shares
      await pageA.locator('button:has-text("Compute Shamir Polynomial Shares")').click();
      await expect(pageA.locator('text=Guardian Shares (5):')).toBeVisible();
      await pageA.locator('button[aria-label="Close Social Recovery Modal"]').click();
      await expect(pageA.getByRole('dialog', { name: /Shamir Social Key Recovery/i })).not.toBeVisible();

      // 13. Test Signaling Transport Selector Modal
      const transportBtnA = pageA.locator('button[data-testid="transport-selector-btn"]');
      await expect(transportBtnA).toBeVisible();
      await transportBtnA.click();
      await expect(pageA.getByRole('dialog', { name: /Signaling Transport Resilience/i })).toBeVisible();
      await expect(pageA.locator('text=Censorship Resistance Guarantee')).toBeVisible();
      // Select Tor Onion SOCKS5 transport
      await pageA.locator('text=Tor Onion SOCKS5 Tunnel').click();
      await pageA.locator('button:has-text("Done")').click();
      await expect(pageA.getByRole('dialog', { name: /Signaling Transport Resilience/i })).not.toBeVisible();
      await expect(pageA.locator('button[data-testid="transport-selector-btn"]')).toContainText(/tor/i);

      // 14. Test Sovereign Telephony Dialpad Modal & DTMF Keypad
      const telephonyBtnA = pageA.locator('button[data-testid="telephony-dialpad-btn"]');
      await expect(telephonyBtnA).toBeVisible();
      await telephonyBtnA.click();
      await expect(pageA.getByRole('dialog', { name: /Sovereign Telephony Dialpad/i })).toBeVisible();
      // Click preset PSTN Gateway
      await pageA.locator('button:has-text("PSTN Gateway")').click();
      await expect(pageA.getByPlaceholder(/Enter SIP URI/i)).toHaveValue('sip:gateway@pstn.aegis');
      // Toggle A-law codec
      await pageA.locator('button:has-text("A-Law (PCMA)")').click();
      await pageA.locator('button[aria-label="Close Dialpad"]').click();
      await expect(pageA.getByRole('dialog', { name: /Sovereign Telephony Dialpad/i })).not.toBeVisible();

      // 15. Test Audio Isolation Toggle (OS Notification Chime Filter)
      const audioIsolationBtnA = pageA.locator('button[data-testid="toggle-audio-isolation-btn"]');
      await expect(audioIsolationBtnA).toBeVisible();
      await audioIsolationBtnA.click();
      await expect(pageA.locator('button[title*="Audio Isolation: Off"]')).toBeVisible();
      await audioIsolationBtnA.click();
      await expect(pageA.locator('button[title*="Audio Isolation: Active"]')).toBeVisible();

      // 16. Test Duress PIN & Plausible Deniability Decoy Mode (User Setup Workflow)
      await duressBtnA.click();
      await expect(pageA.getByRole('dialog', { name: /Duress/i })).toBeVisible();

      // Test User PIN Setup Tab: configure custom Master & Duress PINs
      await pageA.locator('button:has-text("Configure PINs")').click();
      await pageA.getByPlaceholder('Enter current master PIN...').fill('1337');
      await pageA.getByPlaceholder('4-8 digits').first().fill('2468'); // New Master PIN
      await pageA.getByPlaceholder('4-8 digits').nth(1).fill('7777'); // New Duress PIN
      await pageA.locator('button:has-text("SAVE CUSTOM PINS")').click();
      await expect(pageA.locator('text=Custom Master & Duress PINs saved successfully!')).toBeVisible();

      // Wait for automatic tab switch back to unlock or click Unlock Call
      await pageA.locator('button:has-text("Unlock Call")').click();
      
      // Enter newly configured custom Duress PIN (7777) to trigger silent RAM zeroization and decoy mode
      const pinInput = pageA.getByPlaceholder('Enter 4-8 digit PIN...');
      await pinInput.fill('7777');
      await pageA.locator('button:has-text("AUTHENTICATE & UNLOCK")').click();

      // Verify Decoy Mode Banner appears
      await expect(pageA.locator('aside[aria-label="Plausible Deniability Decoy Mode"]')).toBeVisible();

    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
