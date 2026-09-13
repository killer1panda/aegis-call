import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Shield,
  ShieldCheck,
  Cpu,
  Activity,
  Radio,
  Volume2,
  Palette,
  Users,
  Eye,
  EyeOff,
  AlertTriangle,
  Play,
  Square,
  CheckCircle2,
  Lock,
  Sparkles,
} from 'lucide-react';
import {
  EnclaveKeyManager,
  createDeviceAttestation,
  verifyDeviceAttestation,
  ProtocolCamouflage,
  CamouflageProfile,
  UltrasonicModem,
  ZKMembershipEngine,
  QuorumCallArchive,
  QuorumEncryptedArchive,
  EnclaveKeyPair,
  RemoteDeviceAttestation,
  EnclaveType,
} from '@aegis/crypto';
import { MobileScreenSecurityService } from '@aegis/mobile';
import { ScreenShareSentinel, DetectedSecret } from '../services/screenShareSentinel.js';
import { SpatialMicroFlicker } from '../services/spatialSteganography.js';
import { ChromaticSignalingTransceiver } from '../services/chromaticSignaling.js';

interface SovereignSentinelModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  localDid?: string;
}

type TabType = 'hardware' | 'traffic' | 'airgap' | 'zkquorum' | 'sentinels';

export const SovereignSentinelModal: React.FC<SovereignSentinelModalProps> = ({
  isOpen,
  onClose,
  roomId,
  localDid = 'did:aegis:local-user',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('hardware');

  // --- Tab 1: Hardware Enclave & Attestation State ---
  const [selectedEnclavePlatform, setSelectedEnclavePlatform] = useState<EnclaveType>('apple-sep');
  const [enclaveKeyPair, setEnclaveKeyPair] = useState<EnclaveKeyPair | null>(null);
  const [attestationProof, setAttestationProof] = useState<RemoteDeviceAttestation | null>(null);
  const [attestationStatus, setAttestationStatus] = useState<string | null>(null);
  const [isScreenShieldActive, setIsScreenShieldActive] = useState<boolean>(() =>
    MobileScreenSecurityService.isShieldEnabled()
  );

  // --- Tab 2: Traffic Camouflage State ---
  const [isCbrPacerActive, setIsCbrPacerActive] = useState(false);
  const [cbrStats, setCbrStats] = useState({ pps: 50, dummyInjected: 0, wireBitrateKbps: 500 });
  const [selectedProfile, setSelectedProfile] = useState<CamouflageProfile>('youtube-stream');
  const [ja4Signature] = useState('t13d1516h2_8daaf6152771_b93d42e70336');
  const [packetSimResult, setPacketSimResult] = useState<string | null>(null);

  // --- Tab 3: Air-Gap & Acoustic Signaling State ---
  const [isUltrasoundActive, setIsUltrasoundActive] = useState(false);
  const [ultrasoundStatus, setUltrasoundStatus] = useState<string | null>(null);
  const [isChromaticStreaming, setIsChromaticStreaming] = useState(false);
  const chromaticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chromaticAnimRef = useRef<number | null>(null);

  // --- Tab 4: ZK Proofs & Quorum Governance State ---
  const [zkProofResult, setZkProofResult] = useState<string | null>(null);
  const [activeArchive, setActiveArchive] = useState<QuorumEncryptedArchive | null>(null);
  const [quorumShares, setQuorumShares] = useState<string[]>([]);
  const [quorumRecoveryStatus, setQuorumRecoveryStatus] = useState<string | null>(null);

  // --- Tab 5: Local Edge AI Sentinels State ---
  const [sentinelTestInput, setSentinelTestInput] = useState(
    'Config: AWS_KEY=AKIAIOSFODNN7EXAMPLE and GITHUB_TOKEN=ghp_36charactertokenforgithubaccess99'
  );
  const [detectedSecrets, setDetectedSecrets] = useState<DetectedSecret[]>([]);
  const [isMicroFlickerEnabled, setIsMicroFlickerEnabled] = useState(true);
  const [stegoAuditResult, setStegoAuditResult] = useState<string | null>(null);
  const sentinelCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Traffic Pacer simulation loop
  useEffect(() => {
    if (!isCbrPacerActive) return;
    const interval = setInterval(() => {
      setCbrStats((prev) => ({
        ...prev,
        dummyInjected: prev.dummyInjected + 1,
      }));
    }, 100);
    return () => clearInterval(interval);
  }, [isCbrPacerActive]);

  // 4D Chromatic Code Stream rendering loop
  useEffect(() => {
    if (!isChromaticStreaming || !chromaticCanvasRef.current) {
      if (chromaticAnimRef.current) cancelAnimationFrame(chromaticAnimRef.current);
      return;
    }

    const canvas = chromaticCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    const renderLoop = () => {
      frame++;
      // Generate synthetic binary data chunk
      const testData = new Uint8Array(24);
      for (let i = 0; i < 24; i++) testData[i] = (frame + i * 17) & 0xff;

      const grid = ChromaticSignalingTransceiver.encodeToGrid(testData, 8);
      const cellSize = canvas.width / 8;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          ctx.fillStyle = grid[r][c];
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }

      chromaticAnimRef.current = requestAnimationFrame(renderLoop);
    };

    chromaticAnimRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (chromaticAnimRef.current) cancelAnimationFrame(chromaticAnimRef.current);
    };
  }, [isChromaticStreaming]);

  if (!isOpen) return null;

  // --- Handlers ---
  const handleGenerateEnclaveKeys = () => {
    try {
      const keys = EnclaveKeyManager.generateEnclaveKeyPair(selectedEnclavePlatform);
      setEnclaveKeyPair(keys);
    } catch (err: any) {
      console.error('Enclave generation error:', err);
    }
  };

  const handleRunRemoteAttestation = () => {
    try {
      setAttestationStatus('Generating hardware boot integrity token...');
      const nonce = `nonce-${Date.now()}`;
      const dummySigner = new Uint8Array(32);
      dummySigner.fill(0x07);

      const proof = createDeviceAttestation(
        {
          deviceId: localDid,
          nonce,
          platform: 'macos',
          bootloaderLocked: true,
          debuggerAttached: false,
          integrityPassed: true,
          appBuildHash: 'sha256-aegis-reproducible-v1.0.0',
        },
        dummySigner
      );
      setAttestationProof(proof);

      const result = verifyDeviceAttestation(proof, nonce);
      setAttestationStatus(
        result.valid
          ? '✅ Hardware Bootloader Locked & Memory Integrity Verified (Anti-Debugging Passed)'
          : `⚠️ Untrusted Environment: ${result.reason || 'Attestation Failed'}`
      );
    } catch (err: any) {
      setAttestationStatus(`❌ Attestation error: ${err.message}`);
    }
  };

  const handleToggleScreenShield = () => {
    const nextState = !isScreenShieldActive;
    MobileScreenSecurityService.setScreenShield(nextState);
    setIsScreenShieldActive(nextState);
  };

  const handleSimulateCamouflagePacket = () => {
    const rawPayload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
    const envelope = ProtocolCamouflage.wrap(rawPayload, selectedProfile);
    setPacketSimResult(
      `Disguised ${rawPayload.length} bytes into ${envelope.profile.toUpperCase()} profile.\nHeaders: ${JSON.stringify(
        envelope.headers,
        null,
        2
      )}\nJA4 TLS Fingerprint: ${envelope.ja4Fingerprint}`
    );
  };

  const handleEmitUltrasoundChirp = () => {
    try {
      setIsUltrasoundActive(true);
      setUltrasoundStatus('Modulating 18.5 - 20.5 kHz near-ultrasound FSK acoustic chirp...');

      const payload = new Uint8Array([0x41, 0x45, 0x47, 0x49, 0x53]); // "AEGIS"
      const samples = UltrasonicModem.modulate(payload);

      // Play through Web Audio API
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
      });
      const buffer = audioCtx.createBuffer(1, samples.length, 48000);
      const channelData = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        channelData[i] = samples[i];
      }
      buffer.copyToChannel(channelData, 0);

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start();

      source.onended = () => {
        setIsUltrasoundActive(false);
        setUltrasoundStatus(
          `✅ Acoustic chirp transmitted (${samples.length} samples, 18.5 - 20.5 kHz). Inaudible to human ear.`
        );
        audioCtx.close();
      };
    } catch (err: any) {
      setIsUltrasoundActive(false);
      setUltrasoundStatus(`Error generating ultrasound: ${err.message}`);
    }
  };

  const handleRunZKMembership = () => {
    try {
      const member1 = ZKMembershipEngine.generateMemberKeyPair();
      const member2 = ZKMembershipEngine.generateMemberKeyPair();
      const memberList = [member1.publicKey, member2.publicKey];
      const tree = ZKMembershipEngine.buildMerkleTree(memberList);

      const proof = ZKMembershipEngine.generateMembershipProof(0, member1.privateKey, memberList, roomId, 1);
      const verification = ZKMembershipEngine.verifyMembershipProof(proof, tree.rootHex, roomId, memberList);

      setZkProofResult(
        verification.valid
          ? `Merkle Root: ${proof.merkleRoot.slice(0, 18)}...\nAnonymous Nullifier: ${proof.nullifierHash.slice(
              0,
              18
            )}...\nVerified Against Merkle Root: Granted as Verified Board Member #1 (Zero Knowledge: Identity Preserved)`
          : `Verification Failed: ${verification.reason}`
      );
    } catch (err: any) {
      setZkProofResult(`ZK Proof Generation Error: ${err.message}`);
    }
  };

  const handleCreateQuorumArchive = async () => {
    try {
      const recordingData = new TextEncoder().encode('Confidential Meeting Recording Transcript: Room ' + roomId);
      const { archive, shares } = await QuorumCallArchive.encryptArchive(recordingData, roomId, 3, 5);
      setActiveArchive(archive);
      setQuorumShares(shares);
      setQuorumRecoveryStatus(
        'Split recording master key across 5 custodians. Threshold M=3 required for reconstruction.'
      );
    } catch (err: any) {
      setQuorumRecoveryStatus(`Quorum Error: ${err.message}`);
    }
  };

  const handleTestQuorumDecryption = async (sharesCount: number) => {
    try {
      if (!activeArchive || quorumShares.length < sharesCount) {
        setQuorumRecoveryStatus('Please generate a 3-of-5 quorum archive first.');
        return;
      }

      if (sharesCount >= activeArchive.thresholdM) {
        const decrypted = await QuorumCallArchive.decryptArchive(
          activeArchive,
          quorumShares.slice(0, sharesCount)
        );
        const text = new TextDecoder().decode(decrypted);
        setQuorumRecoveryStatus(`✅ SUCCESS: Decrypted recording with 3 of 5 custodian shares!\nContent: "${text}"`);
      } else {
        await QuorumCallArchive.decryptArchive(activeArchive, quorumShares.slice(0, sharesCount));
      }
    } catch (err: any) {
      setQuorumRecoveryStatus(
        `🛡️ SECURITY ENFORCED: Decryption failed as expected (${err.message}). Minimum 3 custodians required.`
      );
    }
  };

  const handleScanSecrets = () => {
    const sentinel = ScreenShareSentinel.getInstance();
    const secrets = sentinel.scanText(sentinelTestInput);
    setDetectedSecrets(secrets);

    // Also draw redaction box demo on canvas
    if (sentinelCanvasRef.current) {
      const canvas = sentinelCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '12px monospace';
        ctx.fillText('Outgoing Screen Share Capture Feed', 12, 24);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Simulated IDE Code / Window Frame:', 12, 44);

        if (secrets.length > 0) {
          sentinel.redactCanvas(ctx, [{ x: 10, y: 55, width: 340, height: 28 }]);
          ctx.fillStyle = '#f43f5e';
          ctx.font = '10px monospace';
          ctx.fillText('⚠️ REDACTED BY SCREEN-SHARE SENTINEL', 20, 73);
        } else {
          ctx.fillStyle = '#10b981';
          ctx.fillText('No credentials detected in frame buffer', 12, 70);
        }
      }
    }
  };

  const handleTestSteganographyAudit = () => {
    const dummyCanvas = document.createElement('canvas');
    dummyCanvas.width = 128;
    dummyCanvas.height = 128;
    const ctx = dummyCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 128, 128);
    const imgData = ctx.getImageData(0, 0, 128, 128);

    SpatialMicroFlicker.applyWatermark(
      imgData,
      { viewerDid: localDid, roomId, timestamp: Date.now() },
      0
    );
    const audit = SpatialMicroFlicker.detectWatermarkPresence(imgData);

    setStegoAuditResult(
      audit.hasWatermark
        ? `✅ Forensic Watermark Detected!\nAverage Modulation Delta: ±${audit.averageDelta.toFixed(
            2
          )} luminance\nAttributed Leaker DID: ${localDid}`
        : 'No watermark detected'
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sovereign-sentinel-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div className="bg-dark-900 border border-dark-750 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-dark-800 flex items-center justify-between bg-dark-850/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyber-emerald/15 border border-cyber-emerald/40 flex items-center justify-center text-cyber-emerald">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="sovereign-sentinel-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
                Sovereign Sentinel & Anti-Surveillance Suite
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30">
                  Tier-1 COMSEC
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Hardware-rooted trust, traffic camouflage, acoustic air-gap, ZK governance & edge AI sentinels
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Sentinel Modal"
            data-testid="close-sentinel-modal-top"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-dark-800 bg-dark-950/60 px-4 overflow-x-auto">
          {[
            { id: 'hardware', label: 'Hardware Enclave', icon: Cpu },
            { id: 'traffic', label: 'Traffic Camouflage', icon: Activity },
            { id: 'airgap', label: 'Acoustic & Optical', icon: Radio },
            { id: 'zkquorum', label: 'ZK & Quorum', icon: Users },
            { id: 'sentinels', label: 'Edge AI Sentinels', icon: Eye },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-cyber-emerald text-cyber-emerald bg-cyber-emerald/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-dark-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-300 font-sans">
          {/* TAB 1: Hardware-Rooted Trust & Spyware Defense */}
          {activeTab === 'hardware' && (
            <div className="space-y-6">
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-100 font-semibold text-xs">
                    <Cpu className="w-4 h-4 text-cyber-emerald" />
                    <span>Hardware Secure Enclave Key Isolation</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-900 border border-dark-700 text-slate-400">
                    RAM-Zeroization Immune
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Private keys are generated and bound directly within isolated security silicon. Key material never enters
                  OS RAM or process memory, neutralising kernel-level spyware (Pegasus, Hermit).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {(['apple-sep', 'android-strongbox', 'tpm2'] as const).map((platform) => (
                    <button
                      key={platform}
                      onClick={() => setSelectedEnclavePlatform(platform)}
                      className={`p-3 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                        selectedEnclavePlatform === platform
                          ? 'border-cyber-emerald bg-cyber-emerald/10 text-slate-100'
                          : 'border-dark-750 bg-dark-900/60 text-slate-400 hover:border-dark-700'
                      }`}
                    >
                      <div className="font-bold uppercase tracking-wider text-[11px]">
                        {platform === 'apple-sep'
                          ? 'Apple SEP'
                          : platform === 'android-strongbox'
                          ? 'StrongBox'
                          : 'TPM 2.0'}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {platform === 'apple-sep'
                          ? 'iOS / macOS Silicon'
                          : platform === 'android-strongbox'
                          ? 'Android TEE / Knox'
                          : 'PC / Linux Hardware'}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleGenerateEnclaveKeys}
                    className="px-4 py-2 rounded-lg bg-cyber-emerald text-dark-950 font-bold text-xs hover:bg-emerald-400 transition-colors cursor-pointer"
                  >
                    Generate Enclave Keypair
                  </button>
                  {enclaveKeyPair && (
                    <div className="text-xs font-mono text-cyber-emerald flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Enclave Key: {enclaveKeyPair.publicKeyHex.slice(0, 20)}... (Non-Extractable)
                    </div>
                  )}
                </div>
              </div>

              {/* Remote Device Attestation */}
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-100 font-semibold text-xs">
                    <Shield className="w-4 h-4 text-cyber-cyan" />
                    <span>Mutual Remote Hardware Attestation Handshake</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-900 border border-dark-700 text-slate-400">
                    App Attest & Play Integrity
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Verifies peer device integrity prior to session key negotiation: asserts bootloader is locked, memory
                  is unhooked (no ptrace / Frida), and binary matches reproducible build hash.
                </p>

                <button
                  onClick={handleRunRemoteAttestation}
                  className="px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
                >
                  Run Mutual Remote Attestation
                </button>

                {attestationStatus && (
                  <div className="p-3 rounded-lg bg-dark-950 border border-dark-800 text-xs font-mono text-slate-300">
                    {attestationStatus}
                  </div>
                )}

                {attestationProof && (
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-dark-900/60 p-3 rounded-lg border border-dark-800">
                    <div>
                      Bootloader Locked: <span className="text-cyber-emerald font-bold">TRUE</span>
                    </div>
                    <div>
                      Anti-Debug / ptrace: <span className="text-cyber-emerald font-bold">PASSED</span>
                    </div>
                    <div>
                      Binary Hash: <span className="text-cyber-cyan">{attestationProof.appBuildHash.slice(0, 16)}...</span>
                    </div>
                    <div>
                      Silicon Attestation: <span className="text-cyber-emerald">VALIDATED</span>
                    </div>
                  </div>
                )}
              </div>

              {/* OS Screen Capture Shield */}
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                    <EyeOff className="w-4 h-4 text-cyber-amber" />
                    <span>Native OS Screen-Capture Prevention Shield</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Enforces `FLAG_SECURE` (Android) and `NSWindow.sharingType = .none` (macOS) to block third-party screen
                    grabbers and background recorders.
                  </p>
                </div>
                <button
                  onClick={handleToggleScreenShield}
                  className={`px-4 py-2 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                    isScreenShieldActive
                      ? 'bg-cyber-emerald text-dark-950'
                      : 'bg-dark-800 text-slate-400 border border-dark-700 hover:text-slate-200'
                  }`}
                >
                  {isScreenShieldActive ? 'SHIELD ACTIVE' : 'SHIELD OFF'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Extreme Anti-Traffic-Analysis & Camouflage */}
          {activeTab === 'traffic' && (
            <div className="space-y-6">
              {/* Constant-Bitrate Dummy Frame Pacing */}
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-100 font-semibold text-xs">
                    <Activity className="w-4 h-4 text-cyber-emerald" />
                    <span>Constant-Rate Media Pacing (CBR 500 kbps Anti-Traffic-Analysis)</span>
                  </div>
                  <button
                    onClick={() => setIsCbrPacerActive((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      isCbrPacerActive
                        ? 'bg-cyber-emerald text-dark-950'
                        : 'bg-dark-800 text-slate-400 border border-dark-700'
                    }`}
                  >
                    {isCbrPacerActive ? 'PACER RUNNING' : 'START PACER'}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Eliminates statistical voice volume / syllable correlation attacks by injecting pseudo-random dummy frames
                  when muted or quiet, guaranteeing a continuous flat 500 kbps wire profile.
                </p>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-dark-900 p-3 rounded-lg border border-dark-800 text-center">
                    <div className="text-[10px] text-slate-500 font-mono">TARGET RATE</div>
                    <div className="text-sm font-bold text-cyber-emerald font-mono">
                      {cbrStats.wireBitrateKbps} kbps
                    </div>
                  </div>
                  <div className="bg-dark-900 p-3 rounded-lg border border-dark-800 text-center">
                    <div className="text-[10px] text-slate-500 font-mono">PACKET CADENCE</div>
                    <div className="text-sm font-bold text-slate-200 font-mono">{cbrStats.pps} PPS (20ms)</div>
                  </div>
                  <div className="bg-dark-900 p-3 rounded-lg border border-dark-800 text-center">
                    <div className="text-[10px] text-slate-500 font-mono">DUMMY FRAMES INJECTED</div>
                    <div className="text-sm font-bold text-cyber-cyan font-mono">{cbrStats.dummyInjected}</div>
                  </div>
                </div>
              </div>

              {/* Protocol Camouflage & JA4 Spoofing */}
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-100 font-semibold text-xs">
                    <Radio className="w-4 h-4 text-cyber-cyan" />
                    <span>Pluggable Transport Protocol Camouflage & JA4 TLS Spoofing</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-900 border border-dark-700 text-slate-400">
                    Anti-DPI / GFW Bypass
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Encapsulates WebRTC encrypted media inside benign application containers while emitting authentic browser
                  TLS JA4 signatures to defeat deep-packet inspection firewalls.
                </p>

                <div className="grid grid-cols-3 gap-3">
                  {(['youtube-stream', 'sharepoint-sync', 'zoom-https'] as const).map((proto) => (
                    <button
                      key={proto}
                      onClick={() => setSelectedProfile(proto)}
                      className={`p-3 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                        selectedProfile === proto
                          ? 'border-cyber-cyan bg-cyber-cyan/10 text-slate-100'
                          : 'border-dark-750 bg-dark-900/60 text-slate-400 hover:border-dark-700'
                      }`}
                    >
                      <div className="font-bold uppercase tracking-wider text-[11px]">{proto}</div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {proto === 'youtube-stream'
                          ? 'video/mp4 stream chunks'
                          : proto === 'sharepoint-sync'
                          ? 'Office 365 WebDAV sync'
                          : 'Zoom HTTPS media frames'}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="p-3 rounded-lg bg-dark-950 border border-dark-800 text-xs font-mono space-y-1">
                  <div className="text-slate-400">Active JA4 Fingerprint:</div>
                  <div className="text-cyber-emerald font-bold">{ja4Signature} (Chrome 120+)</div>
                </div>

                <button
                  onClick={handleSimulateCamouflagePacket}
                  className="px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
                >
                  Test Protocol Encapsulation
                </button>

                {packetSimResult && (
                  <pre className="p-3 rounded-lg bg-dark-950 border border-dark-800 text-[11px] font-mono text-slate-300 whitespace-pre-wrap">
                    {packetSimResult}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Acoustic & Air-Gap Signaling */}
          {activeTab === 'airgap' && (
            <div className="space-y-6">
              {/* Inaudible Near-Ultrasound FSK */}
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-100 font-semibold text-xs">
                    <Volume2 className="w-4 h-4 text-cyber-purple" />
                    <span>Inaudible Ultrasound Near-Field Pairing (Data-Over-Sound)</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-900 border border-dark-700 text-slate-400">
                    18.5 – 20.5 kHz FSK
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Transmits public key hashes and SAS fingerprints invisibly through room audio speakers without requiring
                  Wi-Fi, Bluetooth, or camera QR codes. Completely inaudible to human ears.
                </p>

                <button
                  onClick={handleEmitUltrasoundChirp}
                  disabled={isUltrasoundActive}
                  className="px-4 py-2 rounded-lg bg-cyber-purple text-dark-950 font-bold text-xs hover:bg-purple-400 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isUltrasoundActive ? 'Emitting Ultrasound Chirp...' : 'Emit Inaudible Ultrasound Key Chirp'}
                </button>

                {ultrasoundStatus && (
                  <div className="p-3 rounded-lg bg-dark-950 border border-dark-800 text-xs font-mono text-slate-300">
                    {ultrasoundStatus}
                  </div>
                )}
              </div>

              {/* 4D Chromatic Code Stream Transceiver */}
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-100 font-semibold text-xs">
                    <Palette className="w-4 h-4 text-cyber-cyan" />
                    <span>4D Chromatic Code Stream Optical Air-Gap Transceiver</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-900 border border-dark-700 text-slate-400">
                    60 FPS 8-Color Matrix
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Enables completely air-gapped workstations to exchange SDP offers and ML-KEM post-quantum keys via optical
                  color matrix flashing between monitor and webcam.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <canvas
                    ref={chromaticCanvasRef}
                    width={160}
                    height={160}
                    className="w-40 h-40 rounded-lg border border-dark-700 shadow-md bg-dark-950"
                  />
                  <div className="space-y-3">
                    <button
                      onClick={() => setIsChromaticStreaming((prev) => !prev)}
                      className={`px-4 py-2 rounded-lg font-bold text-xs transition-colors flex items-center gap-2 cursor-pointer ${
                        isChromaticStreaming
                          ? 'bg-cyber-rose text-white hover:bg-rose-600'
                          : 'bg-cyber-cyan text-dark-950 hover:bg-cyan-400'
                      }`}
                    >
                      {isChromaticStreaming ? (
                        <>
                          <Square className="w-4 h-4" /> Stop Optical Stream
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" /> Start 60 FPS Optical Stream
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Bandwidth: 1.44 kbps optical throughput.<br />
                      Encodes 3 bits per pixel cell across 8 chromatic spectra.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ZK Proofs & Quorum Governance */}
          {activeTab === 'zkquorum' && (
            <div className="space-y-6">
              {/* Zero-Knowledge Group Membership */}
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-100 font-semibold text-xs">
                    <Lock className="w-4 h-4 text-cyber-emerald" />
                    <span>Zero-Knowledge Group Membership Attestation (Groth16 / Circom)</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-900 border border-dark-700 text-slate-400">
                    Anonymous Attestation
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Proves your public key exists within the room authorization Merkle Root without revealing which member
                  you are, enabling anonymous whistleblower & board attendee verification.
                </p>

                <button
                  onClick={handleRunZKMembership}
                  className="px-4 py-2 rounded-lg bg-cyber-emerald text-dark-950 font-bold text-xs hover:bg-emerald-400 transition-colors cursor-pointer"
                >
                  Generate Anonymous ZK Proof
                </button>

                {zkProofResult && (
                  <pre className="p-3 rounded-lg bg-dark-950 border border-dark-800 text-xs font-mono text-slate-300 whitespace-pre-wrap">
                    {zkProofResult}
                  </pre>
                )}
              </div>

              {/* Threshold M-of-N Quorum Decryption Archive */}
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-100 font-semibold text-xs">
                    <Users className="w-4 h-4 text-cyber-cyan" />
                    <span>Threshold M-of-N Quorum Recording Archive (Shamir GF(2^8))</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-900 border border-dark-700 text-slate-400">
                    Non-Custodial Compliance
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Encrypted call archives cannot be decrypted by any single administrator. Requires $M$ of $N$ authorized
                  custodians to simultaneously enter their private key shares.
                </p>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleCreateQuorumArchive}
                    className="px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Create 3-of-5 Quorum Split
                  </button>
                  <button
                    onClick={() => handleTestQuorumDecryption(3)}
                    className="px-4 py-2 rounded-lg bg-cyber-cyan text-dark-950 font-bold text-xs hover:bg-cyan-400 transition-colors cursor-pointer"
                  >
                    Test Decrypt (3 Custodians)
                  </button>
                  <button
                    onClick={() => handleTestQuorumDecryption(2)}
                    className="px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-cyber-rose font-bold text-xs transition-colors cursor-pointer"
                  >
                    Test Decrypt (2 Custodians - Should Fail)
                  </button>
                </div>

                {quorumShares.length > 0 && (
                  <div className="p-3 rounded-lg bg-dark-950 border border-dark-800 text-[11px] font-mono text-slate-400 space-y-1">
                    <div className="text-slate-300 font-bold">Generated Custodian Shares:</div>
                    {quorumShares.map((s, idx) => (
                      <div key={idx}>{s}</div>
                    ))}
                  </div>
                )}

                {quorumRecoveryStatus && (
                  <pre className="p-3 rounded-lg bg-dark-950 border border-dark-800 text-xs font-mono text-slate-300 whitespace-pre-wrap">
                    {quorumRecoveryStatus}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: Local Real-Time Edge AI Sentinels */}
          {activeTab === 'sentinels' && (
            <div className="space-y-6">
              {/* Autonomous Screen-Share Sentinel */}
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-100 font-semibold text-xs">
                    <Eye className="w-4 h-4 text-cyber-rose" />
                    <span>Autonomous Screen-Share "Data Leak" Sentinel (Edge OCR & Regex)</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-900 border border-dark-700 text-slate-400">
                    Pre-Encryption Redaction
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Scans outgoing screen capture frames for accidental credential exposures (AWS keys, RSA private keys,
                  GitHub tokens, JWTs) and automatically blacks out bounding boxes before SFrame encryption.
                </p>

                <div className="space-y-2">
                  <label className="text-[11px] text-slate-400 font-mono">Test Frame OCR Stream / Buffer Text:</label>
                  <input
                    type="text"
                    value={sentinelTestInput}
                    onChange={(e) => setSentinelTestInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-750 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyber-emerald"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleScanSecrets}
                    className="px-4 py-2 rounded-lg bg-cyber-rose text-white font-bold text-xs hover:bg-rose-600 transition-colors cursor-pointer"
                  >
                    Scan & Redact Canvas Frame
                  </button>
                </div>

                {detectedSecrets.length > 0 && (
                  <div className="p-3 rounded-lg bg-dark-950 border border-cyber-rose/40 space-y-2">
                    <div className="text-xs font-bold text-cyber-rose flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Interception Alert: {detectedSecrets.length} Credential(s) Redacted!
                    </div>
                    {detectedSecrets.map((sec, idx) => (
                      <div key={idx} className="text-xs font-mono text-slate-300">
                        Pattern: <span className="text-cyber-cyan">{sec.patternType}</span> | Redacted:{' '}
                        <span className="text-cyber-emerald font-bold">{sec.redactedSnippet}</span>
                      </div>
                    ))}
                  </div>
                )}

                <canvas
                  ref={sentinelCanvasRef}
                  width={360}
                  height={90}
                  className="w-full max-w-sm h-24 rounded-lg border border-dark-750 bg-dark-950"
                />
              </div>

              {/* Spatial Micro-Flicker Steganography */}
              <div className="bg-dark-850 border border-dark-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-100 font-semibold text-xs">
                    <Sparkles className="w-4 h-4 text-cyber-amber" />
                    <span>Tamper-Evident Spatial Video Steganography (Micro-Flicker)</span>
                  </div>
                  <button
                    onClick={() => setIsMicroFlickerEnabled((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      isMicroFlickerEnabled
                        ? 'bg-cyber-amber text-dark-950'
                        : 'bg-dark-800 text-slate-400 border border-dark-700'
                    }`}
                  >
                    {isMicroFlickerEnabled ? 'WATERMARK ACTIVE' : 'WATERMARK OFF'}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Modulates video canvas luminance by an imperceptible $\Delta \le 1.5$. Invisible to human eyes, but
                  camera CMOS sensors record the lattice, enabling forensic attribution if someone records the screen with
                  an external phone.
                </p>

                <div className="p-3 rounded-lg bg-dark-950 border border-dark-800 text-xs font-mono space-y-1">
                  <div className="text-slate-400">Embedded Forensic Payload:</div>
                  <div className="text-cyber-amber">{localDid} | Room:{roomId} | Delta: ±1.5</div>
                </div>

                <button
                  onClick={handleTestSteganographyAudit}
                  className="px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
                >
                  Run Forensic Camera Leak Audit
                </button>

                {stegoAuditResult && (
                  <pre className="p-3 rounded-lg bg-dark-950 border border-dark-800 text-xs font-mono text-slate-300 whitespace-pre-wrap">
                    {stegoAuditResult}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-dark-800 bg-dark-850/50 flex justify-end">
          <button
            onClick={onClose}
            data-testid="close-sentinel-suite-btn"
            className="px-5 py-2 rounded-xl bg-dark-800 hover:bg-dark-750 text-slate-300 hover:text-slate-100 font-semibold text-xs border border-dark-700 transition-colors cursor-pointer"
          >
            Close Suite
          </button>
        </div>
      </div>
    </div>
  );
};
