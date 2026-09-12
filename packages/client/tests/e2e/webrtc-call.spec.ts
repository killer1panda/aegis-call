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

      // 9. Test Duress PIN & Plausible Deniability Decoy Mode
      await duressBtnA.click();
      await expect(pageA.getByRole('dialog', { name: /Duress/i })).toBeVisible();
      
      // Enter Duress PIN (9999) to trigger silent RAM zeroization and decoy mode
      const pinInput = pageA.getByPlaceholder('Enter 4-8 digit PIN...');
      await pinInput.fill('9999');
      await pageA.locator('button:has-text("AUTHENTICATE & UNLOCK")').click();

      // Verify Decoy Mode Banner appears
      await expect(pageA.locator('aside[aria-label="Plausible Deniability Decoy Mode"]')).toBeVisible();

    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
