import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { Lobby } from './components/Lobby.js';
import { CallRoom } from './components/CallRoom.js';
import { SecurityBadge } from './components/SecurityBadge.js';
import { NetworkStatsHUD } from './components/NetworkStatsHUD.js';
import { EncryptedChat } from './components/EncryptedChat.js';
import { FileDropModal } from './components/FileDropModal.js';
import { useWebRTC } from './hooks/useWebRTC.js';
import { ShieldCheck, RotateCcw } from 'lucide-react';

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
    setSelectedAudioId,
    setSelectedVideoId,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    sendMessage,
    sendFile,
    markVerified,
    clearUnreadChat,
  } = useWebRTC(roomId);

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
            onJoin={joinCall}
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
            localStream={localStream}
            remoteStream={remoteStream}
            isAudioMuted={isAudioMuted}
            isVideoMuted={isVideoMuted}
            isScreenSharing={isScreenSharing}
            isSelfVerified={isSelfVerified}
            isPeerVerified={isPeerVerified}
            unreadChatCount={unreadChatCount}
            isNoiseSuppressionEnabled={isNoiseSuppressionEnabled}
            onToggleNoiseSuppression={toggleNoiseSuppression}
            isVadActive={isVadActive}
            estimatedNoiseFloorDb={estimatedNoiseFloorDb}
            acousticAuthenticityScore={acousticAuthenticityScore}
            localDid={localDid}
            remoteDid={remoteDid}
            simulcastTier={simulcastTier}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            onToggleScreenShare={toggleScreenShare}
            onOpenSecurity={() => setIsSecurityOpen(true)}
            onToggleHUD={() => setIsHUDOpen((prev) => !prev)}
            onToggleChat={handleOpenChat}
            onOpenFileDrop={() => setIsFileDropOpen(true)}
            onLeave={leaveCall}
            roomId={roomId}
          />
        )}
      </main>

      {/* Security Numbers & MitM Verification Modal */}
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

      {/* Real-time Diagnostics HUD */}
      <NetworkStatsHUD
        isOpen={isHUDOpen}
        onClose={() => setIsHUDOpen(false)}
        networkStats={networkStats}
        cryptoStats={cryptoStats}
        simulcastTier={simulcastTier}
        onSetSimulcastTier={setSimulcastTier}
        abrTelemetry={abrTelemetry}
      />

      {/* End-to-End Encrypted DataChannel Chat Drawer */}
      <EncryptedChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={messages}
        onSendMessage={sendMessage}
      />

      {/* P2P Encrypted File Drop Modal */}
      <FileDropModal
        isOpen={isFileDropOpen}
        onClose={() => setIsFileDropOpen(false)}
        onSendFile={sendFile}
        transferProgress={transferProgress}
        receivedFiles={receivedFiles}
        isDataChannelOpen={isDataChannelOpen}
      />
    </div>
  );
}
export default App;
