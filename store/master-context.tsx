import { SignalingClient } from "amazon-kinesis-video-streams-webrtc";
import { createContext, PropsWithChildren, useState } from "react";

interface Context {
  masterStatus: "Starting" | "Started" | "Stopping" | "Stopped";
  setMasterStatus: Function;
  masterDataChannelByClientId: Record<string, RTCDataChannel> | undefined;
  setMasterDataChannelByClientId: Function;
  masterSignalingClient: SignalingClient | undefined;
  setMasterSignalingClient: Function;
  masterPeerConnectionByClientId: Record<string, RTCPeerConnection> | undefined;
  setMasterPeerConnectionByClientId: Function;
}

const MasterContext = createContext<Context>({
  masterStatus: "Stopped",
  setMasterStatus: () => null,
  masterDataChannelByClientId: undefined,
  setMasterDataChannelByClientId: () => null,
  masterSignalingClient: undefined,
  setMasterSignalingClient: () => null,
  masterPeerConnectionByClientId: undefined,
  setMasterPeerConnectionByClientId: () => null,
});

export function MasterContextProvider({ children }: PropsWithChildren) {
  const [masterStatus, setMasterStatus] = useState<
    "Starting" | "Started" | "Stopping" | "Stopped"
  >("Stopped");

  const [masterDataChannelByClientId, setMasterDataChannelByClientId] =
    useState<Record<string, RTCDataChannel> | undefined>();

  const [masterSignalingClient, setMasterSignalingClient] = useState<
    SignalingClient | undefined
  >();

  const [masterPeerConnectionByClientId, setMasterPeerConnectionByClientId] =
    useState<Record<string, RTCPeerConnection> | undefined>();  

  const context: Context = {
    masterStatus,
    setMasterStatus,
    masterDataChannelByClientId,
    setMasterDataChannelByClientId,
    masterSignalingClient,
    setMasterSignalingClient,
    masterPeerConnectionByClientId,
    setMasterPeerConnectionByClientId,
  };

  return (
    <MasterContext.Provider value={context}>{children}</MasterContext.Provider>
  );
}

export default MasterContext;
