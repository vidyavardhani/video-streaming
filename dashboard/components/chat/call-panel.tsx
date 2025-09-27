'use client';

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';

interface CallPanelProps {
  socket: Socket | null;
  sessionId?: string;
}

export function CallPanel({ socket, sessionId }: CallPanelProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleOffer = async ({ callId: incomingCallId, offer, initiator }: any) => {
      if (initiator === 'agent') return;
      setCallId(incomingCallId);
      await ensurePeer();
      await peerRef.current?.setRemoteDescription(new RTCSessionDescription(offer));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => peerRef.current?.addTrack(track, stream));
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const answer = await peerRef.current?.createAnswer();
      await peerRef.current?.setLocalDescription(answer!);
      socket.emit('call:answer', { callId: incomingCallId, answer });
    };

    const handleAnswer = async ({ answer }: any) => {
      await peerRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
      setIsCalling(false);
    };

    const handleRinging = ({ callId: ringingId }: any) => setCallId(ringingId);

    const handleIce = async ({ candidate }: any) => {
      if (candidate) {
        try {
          await peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error adding ICE candidate', error);
        }
      }
    };

    const handleEnded = () => endCall();

    socket.on('call:offer', handleOffer);
    socket.on('call:ringing', handleRinging);
    socket.on('call:answer', handleAnswer);
    socket.on('call:ice-candidate', handleIce);
    socket.on('call:ended', handleEnded);

    return () => {
      socket.off('call:offer', handleOffer);
      socket.off('call:ringing', handleRinging);
      socket.off('call:answer', handleAnswer);
      socket.off('call:ice-candidate', handleIce);
      socket.off('call:ended', handleEnded);
    };
  }, [socket]);

  const ensurePeer = async () => {
    if (peerRef.current) return peerRef.current;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peer.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };
    peer.onicecandidate = (event) => {
      if (event.candidate && callId) {
        socket?.emit('call:ice-candidate', { callId, candidate: event.candidate });
      }
    };
    peerRef.current = peer;
    return peer;
  };

  const startCall = async () => {
    if (!socket || !sessionId) return;
    setIsCalling(true);
    const peer = await ensurePeer();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    stream.getTracks().forEach((track) => peer?.addTrack(track, stream));
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    const offer = await peer?.createOffer();
    await peer?.setLocalDescription(offer!);
    socket.emit('call:offer', { sessionId, offer });
  };

  const endCall = () => {
    peerRef.current?.close();
    peerRef.current = null;
    if (localVideoRef.current?.srcObject) {
      (localVideoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current?.srcObject) {
      (remoteVideoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      remoteVideoRef.current.srcObject = null;
    }
    if (callId) {
      socket?.emit('call:end', { callId });
    }
    setCallId(null);
    setIsCalling(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Live call</h3>
          <p className="text-xs text-slate-500">Initiate voice/video calls when chat is active.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={startCall} disabled={!sessionId || isCalling || !socket}>
            Start call
          </Button>
          <Button size="sm" variant="outline" onClick={endCall} disabled={!callId && !isCalling}>
            End call
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <video ref={localVideoRef} className="h-40 w-full rounded-lg bg-slate-900 object-cover" autoPlay playsInline muted />
        <video ref={remoteVideoRef} className="h-40 w-full rounded-lg bg-slate-900 object-cover" autoPlay playsInline />
      </div>
    </div>
  );
}
