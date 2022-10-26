## Getting Started

1. Run the development server:
```bash
yarn dev
```

2. Open [http://localhost:3000](http://localhost:3000) in 2 separate tabs/browsers/devices.

3. Select `Start Master` in one tab, select `Start Viewer` in the other. In the Viewer logs, you should see `Received SDP answer` within seconds, which indicates that the Viewer has connected with Master.

4. As the Viewer, enter some message text and `Send`. It should appear in the window above the message field. As Master it should show the Viewer message in the same Window. 

5. Send a message as a Master and confirm that the Viewer receives it.

## Infrastructure

The only thing that needs to be created is an AWS Kinesis Video Stream Signalling channel, which just requires a channel name. 

## POC Current limitations
- Only supports 1 viewer
- Haven't figured out yet how the Master client can correlate a message with a Viewer, and vice versa
- 1 tab can be exclusively a Master OR Viewer
- Stop / disconnect by refreshing the tab

## Terms

- WebRTC: technology specification for enabling real-time communication (RTC) across browsers and mobile applications via simple APIs. It uses peering techniques for real-time data exchange between connected peers. The spec mainly focuses on p2p within the same network, but also explains mechanisms on how to p2p over the public internet
- Master: A peer that initiates the connection and is connected to the signaling channel with the ability to discover and exchange media with any of the signaling channel's connected viewers. Only 1 per channel.
- Viewer: A peer that is connected to the signaling channel with the ability to discover and exchange media only with the signaling channel's Master
- ICE: A list of connection points so that a peer can connect to another peer in the network. Built into modern browsers.
- STUN: Session Traversal Utilities for NAT - used to discover your public address. Necessary when using WebRTC over the public internet as a STUN server needs to be provided when fetching the ICE Candidates
- TURN: Traversal Using Relays around NAT - A server that is used to bypass the Symmetric NAT restriction by opening a connection with a TURN server and relaying all information through that server
- SDP: Session Description Protocol - describes the multimedia content of the connection such as resolution, formats, codecs, encryption, etc. so that both peers can understand each other once the data is transferring.

## Documentation

- [Matrix to help choose the right AWS product](https://aws.amazon.com/blogs/iot/choose-the-right-aws-video-service-for-your-use-case/)
- [AWS Live WebRTC example ](https://awslabs.github.io/amazon-kinesis-video-streams-webrtc-sdk-js/examples/index.html)
- [AWS Live WebRTC example code (i.e. where I stole most of this repo from)](https://github.com/awslabs/amazon-kinesis-video-streams-webrtc-sdk-js)
- [Implementation example](https://dev.to/kevin_odongo35/build-video-chat-app-with-aws-websocket-webrtc-and-vue-final-part-40fn)
- [Pricing](https://aws.amazon.com/kinesis/data-streams/pricing/?nc=sn&loc=3)


