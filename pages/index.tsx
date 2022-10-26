import { KinesisVideo, KinesisVideoSignalingChannels } from "aws-sdk";
import type { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import { Role, SignalingClient } from "amazon-kinesis-video-streams-webrtc";
import { useRef, useState } from "react";

let masterDataChannelByClientId: Record<string, RTCDataChannel> | undefined;
let viewerDataChannel: RTCDataChannel;

const Home: NextPage = () => {
  const region = process.env.NEXT_PUBLIC_AWS_REGION!;
  const accessKeyId = process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!;
  const chatRef = useRef<HTMLPreElement>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const [masterStatus, setMasterStatus] = useState<
    "Starting" | "Started" | "Stopping" | "Stopped"
  >("Stopped");
  const [viewerStatus, setViewerStatus] = useState<
    "Starting" | "Started" | "Stopping" | "Stopped"
  >("Stopped");

  let masterSignalingClient: SignalingClient | undefined;
  let masterPeerConnectionByClientId:
    | Record<string, RTCPeerConnection>
    | undefined;
  let viewerSignalingClient: SignalingClient | undefined;
  let viewerPeerConnection: RTCPeerConnection;

  const getRandomClientId = () => {
    return Math.random().toString(36).substring(2).toUpperCase();
  };

  const appendLogMessage = (message: string) => {
    logRef.current!.textContent += `${new Date().toLocaleString()} ${message}\n`;
  };

  const appendChatMessage = (message: MessageEvent<any>) => {
    chatRef.current!.textContent += `${message.data}\n`;
  };

  const startMaster = async () => {
    if (["starting", "stopping"].includes(masterStatus)) {
      return;
    }

    const kinesisVideoClient = new KinesisVideo({
      region,
      accessKeyId,
      secretAccessKey,
      correctClockSkew: true,
    });

    const describeSignalingChannelResponse = await kinesisVideoClient
      .describeSignalingChannel({
        ChannelName: process.env.NEXT_PUBLIC_KINESIS_CHANNEL_NAME!,
      })
      .promise();

    const channelARN =
      describeSignalingChannelResponse.ChannelInfo!.ChannelARN!;

    appendLogMessage(`[CREATE_SIGNALING_CHANNEL] Channel ARN: ${channelARN}`);

    const getSignalingChannelEndpointResponse = await kinesisVideoClient
      .getSignalingChannelEndpoint({
        ChannelARN: channelARN,
        SingleMasterChannelEndpointConfiguration: {
          Protocols: ["WSS", "HTTPS"],
          Role: Role.MASTER,
        },
      })
      .promise();

    const endpointsByProtocol =
      getSignalingChannelEndpointResponse.ResourceEndpointList!.reduce(
        (endpoints, endpoint) => {
          endpoints[endpoint.Protocol!] = endpoint.ResourceEndpoint;
          return endpoints;
        },
        {} as Record<string, string | undefined>
      );

    appendLogMessage(
      `[MASTER] Endpoints: ${JSON.stringify(endpointsByProtocol)}`
    );

    masterSignalingClient = new SignalingClient({
      channelARN,
      channelEndpoint: endpointsByProtocol!.WSS!,
      role: Role.MASTER,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      systemClockOffset: kinesisVideoClient.config.systemClockOffset,
    });

    const kinesisVideoSignalingChannelsClient =
      new KinesisVideoSignalingChannels({
        region,
        accessKeyId,
        secretAccessKey,
        endpoint: endpointsByProtocol!.HTTPS,
        correctClockSkew: true,
      });

    const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
      .getIceServerConfig({
        ChannelARN: channelARN,
      })
      .promise();

    const iceServers = [];
    iceServers.push({
      urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443`,
    });

    getIceServerConfigResponse.IceServerList!.forEach((iceServer) =>
      iceServers.push({
        urls: iceServer.Uris,
        username: iceServer.Username,
        credential: iceServer.Password,
      })
    );

    const configuration: RTCConfiguration = {
      iceServers,
      iceTransportPolicy: "all",
    };

    masterSignalingClient!.on("open", async () => {
      setMasterStatus("Started");
      appendLogMessage("[MASTER] Connected to signaling service");
    });

    masterSignalingClient!.on("sdpOffer", async (offer, remoteClientId) => {
      appendLogMessage(
        "[MASTER] Received SDP offer from client: " + remoteClientId
      );

      // Create a new peer connection using the offer from the given client
      const peerConnection = new RTCPeerConnection(configuration);

      masterPeerConnectionByClientId = {
        [remoteClientId]: peerConnection,
      };

      masterDataChannelByClientId = {
        [remoteClientId]: peerConnection.createDataChannel("kvsDataChannel"),
      };

      peerConnection.ondatachannel = (event) => {
        event.channel.onmessage = appendChatMessage;
      };

      // let peerConnectionStatsInterval: NodeJS.Timer | undefined;
      // Poll for connection stats
      // if (!peerConnectionStatsInterval) {
      // peerConnectionStatsInterval = setInterval(
      //   () => peerConnection.getStats().then(onStatsReport),
      //   1000
      // );
      // }

      // Send any ICE candidates to the other peer
      peerConnection.addEventListener("icecandidate", ({ candidate }) => {
        if (candidate) {
          appendLogMessage(
            "[MASTER] Sending ICE candidate to client: " + remoteClientId
          );
          masterSignalingClient!.sendIceCandidate(candidate, remoteClientId);
        } else {
          appendLogMessage(
            "[MASTER] All ICE candidates have been generated for client: " +
              remoteClientId
          );
        }
      });

      await peerConnection.setRemoteDescription(offer);

      // Create an SDP answer to send back to the client
      appendLogMessage(
        "[MASTER] Creating SDP answer for client: " + remoteClientId
      );
      await peerConnection.setLocalDescription(
        await peerConnection.createAnswer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        })
      );

      // When trickle ICE is enabled, send the answer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
      appendLogMessage(
        "[MASTER] Sending SDP answer to client: " + remoteClientId
      );

      masterSignalingClient!.sendSdpAnswer(
        peerConnection.localDescription!,
        remoteClientId
      );
      appendLogMessage(
        "[MASTER] Generating ICE candidates for client: " + remoteClientId
      );
    });

    masterSignalingClient!.on("iceCandidate", (candidate, remoteClientId) => {
      appendLogMessage(
        "[MASTER] Received ICE candidate from client: " + remoteClientId
      );

      // Add the ICE candidate received from the client to the peer connection
      const peerConnection = masterPeerConnectionByClientId![remoteClientId];
      peerConnection.addIceCandidate(candidate);
    });

    masterSignalingClient!.on("close", () => {
      appendLogMessage("[MASTER] Disconnected from signaling channel");
    });

    masterSignalingClient!.on("error", () => {
      appendLogMessage("[MASTER] Signaling client error");
    });

    appendLogMessage("[MASTER] Starting master connection");

    masterSignalingClient!.open();
  };

  const sendMasterMessage = (message: string) => {
    if (!masterDataChannelByClientId) return;

    Object.keys(masterDataChannelByClientId).forEach((clientId) => {
      try {
        masterDataChannelByClientId![clientId].send(message);
      } catch (e) {
        appendLogMessage(`[MASTER] Send DataChannel: ${e.toString()}`);
        throw e;
      }
    });
    appendChatMessage({ data: message } as MessageEvent);
    msgRef.current!.value = "";
  };

  const startViewer = async () => {
    const kinesisVideoClient = new KinesisVideo({
      region,
      accessKeyId,
      secretAccessKey,
      correctClockSkew: true,
    });

    const describeSignalingChannelResponse = await kinesisVideoClient
      .describeSignalingChannel({
        ChannelName: process.env.NEXT_PUBLIC_KINESIS_CHANNEL_NAME!,
      })
      .promise();

    const channelARN =
      describeSignalingChannelResponse.ChannelInfo!.ChannelARN!;

    appendLogMessage(`[VIEWER] Channel ARN: ${channelARN}`);

    const getSignalingChannelEndpointResponse = await kinesisVideoClient
      .getSignalingChannelEndpoint({
        ChannelARN: channelARN,
        SingleMasterChannelEndpointConfiguration: {
          Protocols: ["WSS", "HTTPS"],
          Role: Role.VIEWER,
        },
      })
      .promise();

    const endpointsByProtocol =
      getSignalingChannelEndpointResponse.ResourceEndpointList!.reduce(
        (endpoints, endpoint) => {
          endpoints[endpoint.Protocol!] = endpoint.ResourceEndpoint;
          return endpoints;
        },
        {} as Record<string, string | undefined>
      );

    appendLogMessage(
      `[VIEWER] Endpoints: ${JSON.stringify(endpointsByProtocol)}`
    );

    const kinesisVideoSignalingChannelsClient =
      new KinesisVideoSignalingChannels({
        region,
        accessKeyId,
        secretAccessKey,
        endpoint: endpointsByProtocol!.HTTPS,
        correctClockSkew: true,
      });

    const getIceServerConfigResponse =
      await kinesisVideoSignalingChannelsClient!
        .getIceServerConfig({
          ChannelARN: channelARN,
        })
        .promise();

    const iceServers = [];
    iceServers.push({
      urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443`,
    });

    getIceServerConfigResponse.IceServerList!.forEach((iceServer) =>
      iceServers.push({
        urls: iceServer.Uris,
        username: iceServer.Username,
        credential: iceServer.Password,
      })
    );

    appendLogMessage(`[VIEWER] ICE servers: ${JSON.stringify(iceServers)}`);

    viewerSignalingClient = new SignalingClient({
      channelARN,
      channelEndpoint: endpointsByProtocol!.WSS!,
      clientId: getRandomClientId(),
      role: Role.VIEWER,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      systemClockOffset: kinesisVideoClient.config.systemClockOffset,
    });

    const configuration: RTCConfiguration = {
      iceServers,
      iceTransportPolicy: "all",
    };

    viewerPeerConnection = new RTCPeerConnection(configuration);

    viewerDataChannel =
      viewerPeerConnection.createDataChannel("kvsDataChannel");

    viewerPeerConnection.ondatachannel = (event) => {
      event.channel.onmessage = appendChatMessage;
    };

    // Poll for connection stats
    // viewerPeerConnectionStatsInterval = setInterval(
    //   () => viewerPeerConnection.getStats().then(onStatsReport),
    //   1000
    // );

    viewerSignalingClient.on("open", async () => {
      appendLogMessage("[VIEWER] Connected to signaling service");

      // Create an SDP offer to send to the master
      appendLogMessage("[VIEWER] Creating SDP offer");
      await viewerPeerConnection.setLocalDescription(
        await viewerPeerConnection.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        })
      );

      // When trickle ICE is enabled, send the offer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
      appendLogMessage("[VIEWER] Sending SDP offer");

      viewerSignalingClient!.sendSdpOffer(
        viewerPeerConnection.localDescription!
      );
      appendLogMessage("[VIEWER] Generating ICE candidates");
    });

    viewerSignalingClient.on("sdpAnswer", async (answer) => {
      setViewerStatus("Started");
      // Add the SDP answer to the peer connection
      appendLogMessage("[VIEWER] Received SDP answer");
      await viewerPeerConnection.setRemoteDescription(answer);
    });

    viewerSignalingClient.on("iceCandidate", (candidate) => {
      // Add the ICE candidate received from the MASTER to the peer connection
      appendLogMessage("[VIEWER] Received ICE candidate");
      viewerPeerConnection.addIceCandidate(candidate);
    });

    viewerSignalingClient.on("close", () => {
      appendLogMessage("[VIEWER] Disconnected from signaling channel");
    });

    viewerSignalingClient.on("error", (error) => {
      appendLogMessage(`[VIEWER] Signaling client error: ${error}`);
    });

    // Send any ICE candidates to the other peer
    viewerPeerConnection.addEventListener("icecandidate", ({ candidate }) => {
      if (candidate) {
        appendLogMessage("[VIEWER] Sending ICE candidate");
        viewerSignalingClient!.sendIceCandidate(candidate);
      } else {
        appendLogMessage("[VIEWER] All ICE candidates have been generated");
      }
    });

    appendLogMessage("[VIEWER] Starting viewer connection");

    viewerSignalingClient.open();
  };

  const sendViewerMessage = (message: string) => {
    if (viewerDataChannel) {
      try {
        viewerDataChannel.send(message);
        appendChatMessage({ data: message } as MessageEvent);
        msgRef.current!.value = "";
      } catch (e) {
        appendLogMessage(`[VIEWER] Send DataChannel: ${e.toString()}`);
      }
    }
  };

  const sendMessage = () => {
    return masterStatus === "Started"
      ? sendMasterMessage(msgRef.current!.value)
      : viewerStatus === "Started"
      ? sendViewerMessage(msgRef.current!.value)
      : () => null;
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>WebRTC POC</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>WebRTC Messaging</h1>

        <div>
          <button
            onClick={startMaster}
            type="button"
            className={styles.btn}
            disabled={
              viewerStatus !== "Stopped" &&
              !["Started", "Stopped"].includes(masterStatus)
            }
          >
            {masterStatus === "Stopped"
              ? "Start"
              : masterStatus === "Started"
              ? "Stop"
              : masterStatus}{" "}
            Master
          </button>
          <button
            onClick={startViewer}
            type="button"
            className={styles.btn}
            disabled={
              masterStatus !== "Stopped" &&
              !["Started", "Stopped"].includes(viewerStatus)
            }
          >
            {viewerStatus === "Stopped"
              ? "Start"
              : viewerStatus === "Started"
              ? "Stop"
              : viewerStatus}{" "}
            Viewer
          </button>
        </div>

        <div className={styles.contentContainer}>
          <div className={styles.logsContainer}>
            <h3>Logs</h3>
            <pre ref={logRef} className={styles.logs}></pre>
          </div>

          <div className={styles.chatContainer}>
            <h3>Chat</h3>
            <pre ref={chatRef} className={styles.logs}></pre>
            <textarea
              ref={msgRef}
              rows={2}
              className={styles.chat}
              placeholder="Message"
            ></textarea>
            <button
              onClick={sendMessage}
              type="button"
              className={`${styles.btn} ${styles["btn-send"]}`}
            >
              Send
            </button>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{" "}
          <span className={styles.logo}>
            <Image src="/vercel.svg" alt="Vercel Logo" width={72} height={16} />
          </span>
        </a>
      </footer>
    </div>
  );
};

export default Home;
