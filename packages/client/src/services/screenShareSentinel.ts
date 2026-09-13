/**
 * AegisCall Autonomous Screen-Share "Data Leak" Sentinel (Computer Vision on Edge)
 * Analyzes outgoing screen capture frames for accidental credential exposures
 * (AWS access keys, SSH/RSA private keys, GitHub tokens, JWTs, credit card numbers)
 * and automatically blacks out or blurs the bounding box before SFrame encryption.
 */

export interface DetectedSecret {
  patternType: 'aws-key' | 'private-key' | 'github-token' | 'bearer-token' | 'credit-card';
  matchedText: string;
  redactedSnippet: string;
  confidence: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

export const SECRET_PATTERNS = [
  {
    type: 'aws-key' as const,
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
  },
  {
    type: 'private-key' as const,
    regex: /-----BEGIN\s+(?:RSA|OPENSSH|EC|DSA)?\s*PRIVATE\s+KEY-----/g,
  },
  {
    type: 'github-token' as const,
    regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,255})\b/g,
  },
  {
    type: 'bearer-token' as const,
    regex: /\b(ey[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,})\b/g,
  },
  {
    type: 'credit-card' as const,
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
  },
];

export class ScreenShareSentinel {
  private static instance: ScreenShareSentinel | null = null;
  private totalLeaksIntercepted = 0;

  public static getInstance(): ScreenShareSentinel {
    if (!ScreenShareSentinel.instance) {
      ScreenShareSentinel.instance = new ScreenShareSentinel();
    }
    return ScreenShareSentinel.instance;
  }

  /**
   * Scans text content extracted from optical character recognition (OCR) or DOM render trees.
   */
  public scanText(text: string): DetectedSecret[] {
    const findings: DetectedSecret[] = [];

    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.regex.exec(text)) !== null) {
        const fullMatch = match[0];
        const redactedSnippet =
          fullMatch.length > 8
            ? `${fullMatch.slice(0, 4)}••••••••${fullMatch.slice(-4)}`
            : '••••••••';

        findings.push({
          patternType: pattern.type,
          matchedText: fullMatch,
          redactedSnippet,
          confidence: 0.98,
        });
        this.totalLeaksIntercepted++;
      }
    }

    return findings;
  }

  /**
   * Sanitizes canvas video buffer by blacking out coordinates containing detected secrets.
   */
  public redactCanvas(
    ctx: CanvasRenderingContext2D,
    boundingBoxes: Array<{ x: number; y: number; width: number; height: number }>
  ): void {
    ctx.save();
    for (const box of boundingBoxes) {
      // Draw solid cyber-dark redaction block
      ctx.fillStyle = '#05070a';
      ctx.fillRect(box.x, box.y, box.width, box.height);

      // Render cautionary security border
      ctx.strokeStyle = '#f43f5e'; // cyber-rose
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
    }
    ctx.restore();
  }

  public getLeakCount(): number {
    return this.totalLeaksIntercepted;
  }
}
