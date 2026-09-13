import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Navbar } from './components/Navbar.js';
import { Lobby } from './components/Lobby.js';
import { CallRoom } from './components/CallRoom.js';
import type { SignalingTransportType } from './components/TransportSelector.js';
import { useWebRTC } from './hooks/useWebRTC.js';
import { useLiveCaptions } from './hooks/useLiveCaptions.js';
import { useVideoPrivacyMask } from './hooks/useVideoPrivacyMask.js';
import { ShieldCheck, RotateCcw } from 'lucide-react';

const SecurityBadge = lazy(() => import('./components/SecurityBadge.js').then(m => ({ default: m.SecurityBadge })));
const NetworkStatsHUD = lazy(() => import('./components/NetworkStatsHUD.js').then(m => ({ default: m.NetworkStatsHUD })));
const EncryptedChat = lazy(() => import('./components/EncryptedChat.js').then(m => ({ default: m.EncryptedChat })));
const FileDropModal = lazy(() => import('./components/FileDropModal.js').then(m => ({ default: m.FileDropModal })));
const WhiteboardModal = lazy(() => import('./components/WhiteboardModal.js').then(m => ({ default: m.WhiteboardModal })));
const ScratchpadModal = lazy(() => import('./components/ScratchpadModal.js').then(m => ({ default: m.ScratchpadModal })));
const DuressUnlockModal = lazy(() => import('./components/DuressUnlockModal.js').then(m => ({ default: m.DuressUnlockModal })));
const HardwareGateModal = lazy(() => import('./components/HardwareGateModal.js').then(m => ({ default: m.HardwareGateModal })));
const SocialRecoveryModal = lazy(() => import('./components/SocialRecoveryModal.js').then(m => ({ default: m.SocialRecoveryModal })));
const TelephonyDialpadModal = lazy(() => import('./components/TelephonyDialpadModal.js').then(m => ({ default: m.TelephonyDialpadModal })));
const TransportSelectorModal = lazy(() => import('./components/TransportSelector.js').then(m => ({ default: m.TransportSelectorModal })));
const SovereignSentinelModal = lazy(() => import('./components/SovereignSentinelModal.js').then(m => ({ default: m.SovereignSentinelModal })));

export function App() {
  // Read room from URL search params if present
  const [roomId, setRoomId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'aegis-secure-demo';
  });

  const [isHUDOpen, setIsHUDOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isFileDropOpen, setIsFileDropOpen] = useState(false);
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [isDuressOpen, setIsDuressOpen] = useState(false);
  const [isSocialRecoveryOpen, setIsSocialRecoveryOpen] = useState(false);
  const [isTelephonyOpen, setIsTelephonyOpen] = useState(false);
  const [isTransportSelectorOpen, setIsTransportSelectorOpen] = useState(false);
  const [isSentinelOpen, setIsSentinelOpen] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState<SignalingTransportType>('ws');
  const [deadManTimeoutMinutes, setDeadManTimeoutMinutes] = useState(5);

  const {
    callState,
    errorMessage,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    safetyNumbers,
    isSelfVerified,
    isPeerVerified,
    localDid,
    remoteDid,
    isVadActive,
    estimatedNoiseFloorDb,
    acousticAuthenticityScore,
    simulcastTier,
    setSimulcastTier,
    abrTelemetry,
    messages,
    unreadChatCount,
    networkStats,
    cryptoStats,
    audioDevices,
    videoDevices,
    selectedAudioId,
    selectedVideoId,
    isDataChannelOpen,
    transferProgress,
    receivedFiles,
    isNoiseSuppressionEnabled,
    toggleNoiseSuppression,
    isVoiceMaskEnabled,
    toggleVoiceMask,
    incomingStroke,
    broadcastStroke,
    incomingScratchpadText,
    broadcastScratchpadText,
    isDecoyMode,
    triggerDuressWipe,
    setSelectedAudioId,
    setSelectedVideoId,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    isAudioIsolationEnabled,
    toggleAudioIsolation,
    sendMessage,
    sendFile,
    markVerified,
    clearUnreadChat,
    incomingCaption,
    broadcastCaption,
  } = useWebRTC(roomId, selectedTransport);

  // Real-Time Video Privacy Shroud / Face Blur Filter
  const {
    isPrivacyMaskActive,
    processedStream,
    togglePrivacyMask,
  } = useVideoPrivacyMask(localStream);

  // Zero-Cloud Local Closed Captions & Live Transcription
  const {
    isCaptionsEnabled,
    captions,
    toggleCaptions,
    addIncomingCaption,
  } = useLiveCaptions({
    onBroadcastCaption: broadcastCaption,
    localStream,
  });

  // Relay incoming peer captions received over WebRTC DataChannel to local transcript stream
  useEffect(() => {
    if (incomingCaption?.text) {
      addIncomingCaption(incomingCaption.text, 'peer');
    }
  }, [incomingCaption, addIncomingCaption]);

  // High-Assurance Room Hardware Gate (FIDO2 / YubiKey touch challenge)
  const isHighAssuranceRoom =
    roomId.includes('high-assurance') ||
    roomId.includes('fido') ||
    (typeof window !== 'undefined' && window.location.search.includes('hwgate=1'));
  const [isHardwareGateOpen, setIsHardwareGateOpen] = useState(false);
  const [isHardwareGatePassed, setIsHardwareGatePassed] = useState(false);

  const handleJoinAttempt = () => {
    if (isHighAssuranceRoom && !isHardwareGatePassed) {
      setIsHardwareGateOpen(true);
      return;
    }
    joinCall();
  };

  const handleHardwareGatePassed = () => {
    setIsHardwareGatePassed(true);
    joinCall();
  };

  // Dead Man's Inactivity Switch: silent zeroization if user is immobilized or coerced
  useEffect(() => {
    if (callState !== 'connected') return;

    let timeoutId: number;
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        console.warn('Dead Man Inactivity Switch triggered! Wiping keys & leaving call.');
        triggerDuressWipe();
        leaveCall();
      }, deadManTimeoutMinutes * 60 * 1000);
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    activityEvents.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [callState, deadManTimeoutMinutes, triggerDuressWipe, leaveCall]);

  // Sync URL search params when roomId changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    window.history.replaceState({}, '', url.toString());
  }, [roomId]);

  const handleOpenChat = () => {
    setIsChatOpen((prev) => {
      if (!prev) clearUnreadChat();
      return !prev;
    });
  };

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col font-sans text-slate-100">
      <Navbar
        roomId={roomId}
        callState={callState}
        isPeerVerified={isPeerVerified}
        isSelfVerified={isSelfVerified}
        onOpenSecurity={() => setIsSecurityOpen(true)}
        onToggleHUD={() => setIsHUDOpen((prev) => !prev)}
        isHUDOpen={isHUDOpen}
        onOpenSocialRecovery={() => setIsSocialRecoveryOpen(true)}
        onOpenTelephony={() => setIsTelephonyOpen(true)}
        onOpenTransportSelector={() => setIsTransportSelectorOpen(true)}
        onOpenSentinelSuite={() => setIsSentinelOpen(true)}
        selectedTransport={selectedTransport}
      />

      <main className="flex-1 flex flex-col">
        {callState === 'lobby' || callState === 'idle' || callState === 'room-full' || callState === 'error' ? (
          <Lobby
            roomId={roomId}
            setRoomId={setRoomId}
            localStream={localStream}
            isAudioMuted={isAudioMuted}
            isVideoMuted={isVideoMuted}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            audioDevices={audioDevices}
            videoDevices={videoDevices}
            selectedAudioId={selectedAudioId}
            selectedVideoId={selectedVideoId}
            onSelectAudio={setSelectedAudioId}
            onSelectVideo={setSelectedVideoId}
            onJoin={handleJoinAttempt}
            errorMessage={errorMessage}
          />
        ) : callState === 'ended' ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="bg-dark-900 border border-dark-750 rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl">
              <div className="w-16 h-16 rounded-2xl bg-cyber-emerald/10 border border-cyber-emerald/30 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8 text-cyber-emerald" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-100">Call Securely Ended</h2>
                <p className="text-xs text-slate-400">
                  All ephemeral keys and memory frames have been purged from browser memory.
                </p>
              </div>

              <div className="bg-dark-950 border border-dark-800 rounded-xl p-4 text-xs font-mono space-y-2 text-left">
                <div className="flex justify-between text-slate-400">
                  <span>Room ID:</span>
                  <span className="text-slate-200">{roomId}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Encryption Suite:</span>
                  <span className="text-cyber-emerald font-semibold">AES-256-GCM + X25519</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Peer Verification:</span>
                  <span className={isPeerVerified ? 'text-cyber-emerald' : 'text-slate-400'}>
                    {isPeerVerified ? 'Mutually Verified' : 'Unverified'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 rounded-xl bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Return to Lobby
              </button>
            </div>
          </div>
        ) : (
          <CallRoom
            localStream={isPrivacyMaskActive && processedStream ? processedStream : localStream}
            remoteStream={remoteStream}
            isAudioMuted={isAudioMuted}
            isVideoMuted={isVideoMuted}
            isScreenSharing={isScreenSharing}
            isSelfVerified={isSelfVerified}
            isPeerVerified={isPeerVerified}
            unreadChatCount={unreadChatCount}
            isNoiseSuppressionEnabled={isNoiseSuppressionEnabled}
            onToggleNoiseSuppression={toggleNoiseSuppression}
            isVoiceMaskEnabled={isVoiceMaskEnabled}
            onToggleVoiceMask={toggleVoiceMask}
            onOpenWhiteboard={() => setIsWhiteboardOpen(true)}
            onOpenScratchpad={() => setIsScratchpadOpen(true)}
            onOpenDuress={() => setIsDuressOpen(true)}
            isCaptionsEnabled={isCaptionsEnabled}
            onToggleCaptions={toggleCaptions}
            captions={captions}
            isPrivacyMaskActive={isPrivacyMaskActive}
            onTogglePrivacyMask={togglePrivacyMask}
            isVadActive={isVadActive}
            estimatedNoiseFloorDb={estimatedNoiseFloorDb}
            acousticAuthenticityScore={acousticAuthenticityScore}
            localDid={localDid}
            remoteDid={remoteDid}
            simulcastTier={simulcastTier}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            onToggleScreenShare={toggleScreenShare}
            isAudioIsolationEnabled={isAudioIsolationEnabled}
            onToggleAudioIsolation={toggleAudioIsolation}
            onOpenTelephony={() => setIsTelephonyOpen(true)}
            onOpenSentinelSuite={() => setIsSentinelOpen(true)}
            onOpenSecurity={() => setIsSecurityOpen(true)}
            onToggleHUD={() => setIsHUDOpen((prev) => !prev)}
            onToggleChat={handleOpenChat}
            onOpenFileDrop={() => setIsFileDropOpen(true)}
            onLeave={leaveCall}
            roomId={roomId}
          />
        )}
      </main>

      {/* Dynamic Auxiliary Security & Utility Modals (Code-Split via React.lazy) */}
      <Suspense fallback={null}>
        {isSecurityOpen && (
          <SecurityBadge
            isOpen={isSecurityOpen}
            onClose={() => setIsSecurityOpen(false)}
            safetyNumbers={safetyNumbers}
            isSelfVerified={isSelfVerified}
            isPeerVerified={isPeerVerified}
            onMarkVerified={markVerified}
            roomId={roomId}
            localDid={localDid}
            remoteDid={remoteDid}
          />
        )}

        {isHUDOpen && (
          <NetworkStatsHUD
            isOpen={isHUDOpen}
            onClose={() => setIsHUDOpen(false)}
            networkStats={networkStats}
            cryptoStats={cryptoStats}
            simulcastTier={simulcastTier}
            onSetSimulcastTier={setSimulcastTier}
            abrTelemetry={abrTelemetry}
          />
        )}

        {isChatOpen && (
          <EncryptedChat
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            messages={messages}
            onSendMessage={sendMessage}
          />
        )}

        {isFileDropOpen && (
          <FileDropModal
            isOpen={isFileDropOpen}
            onClose={() => setIsFileDropOpen(false)}
            onSendFile={sendFile}
            transferProgress={transferProgress}
            receivedFiles={receivedFiles}
            isDataChannelOpen={isDataChannelOpen}
          />
        )}

        {isWhiteboardOpen && (
          <WhiteboardModal
            isOpen={isWhiteboardOpen}
            onClose={() => setIsWhiteboardOpen(false)}
            onBroadcastStroke={broadcastStroke}
            incomingStroke={incomingStroke}
            isDataChannelOpen={isDataChannelOpen}
          />
        )}

        {isScratchpadOpen && (
          <ScratchpadModal
            isOpen={isScratchpadOpen}
            onClose={() => setIsScratchpadOpen(false)}
            onBroadcastText={broadcastScratchpadText}
            incomingText={incomingScratchpadText}
            isDataChannelOpen={isDataChannelOpen}
          />
        )}

        {isDuressOpen && (
          <DuressUnlockModal
            isOpen={isDuressOpen}
            onClose={() => setIsDuressOpen(false)}
            onUnlockSuccess={(isDecoy) => {
              if (isDecoy) {
                triggerDuressWipe();
              }
            }}
            onUpdateDeadManTimeout={setDeadManTimeoutMinutes}
            currentDeadManTimeout={deadManTimeoutMinutes}
          />
        )}

        {isHardwareGateOpen && (
          <HardwareGateModal
            isOpen={isHardwareGateOpen}
            onClose={() => setIsHardwareGateOpen(false)}
            onGatePassed={handleHardwareGatePassed}
            roomId={roomId}
          />
        )}

        {isSocialRecoveryOpen && (
          <SocialRecoveryModal
            isOpen={isSocialRecoveryOpen}
            onClose={() => setIsSocialRecoveryOpen(false)}
            masterKeyHex={localDid || undefined}
          />
        )}

        {isTelephonyOpen && (
          <TelephonyDialpadModal
            isOpen={isTelephonyOpen}
            onClose={() => setIsTelephonyOpen(false)}
            roomId={roomId}
          />
        )}

        {isTransportSelectorOpen && (
          <TransportSelectorModal
            isOpen={isTransportSelectorOpen}
            onClose={() => setIsTransportSelectorOpen(false)}
            selectedTransport={selectedTransport}
            onSelectTransport={setSelectedTransport}
          />
        )}

        {isSentinelOpen && (
          <SovereignSentinelModal
            isOpen={isSentinelOpen}
            onClose={() => setIsSentinelOpen(false)}
            roomId={roomId}
            localDid={localDid || undefined}
          />
        )}
      </Suspense>

      {/* Decoy Mode Banner */}
      {isDecoyMode && (
        <aside
          aria-label="Plausible Deniability Decoy Mode"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-cyber-amber/90 text-dark-950 text-xs font-bold shadow-lg border border-amber-400 animate-bounce flex items-center gap-2"
        >
          <span>⚠️ DECOY MODE ACTIVE — EPHEMERAL KEYS PURGED FROM MEMORY</span>
        </aside>
      )}
    </div>
  );
}
export default App;
