/*
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package main

import (
	"errors"
	"fmt"
	"io"
	"log/slog"

	"github.com/pion/webrtc/v4"
)

type WebRTCPeer struct {
	pc             *webrtc.PeerConnection
	localTrackChan chan *webrtc.TrackLocalStaticRTP
}

func NewWebRTCPeer() (*WebRTCPeer, error) {

	var err error
	wp := &WebRTCPeer{}
	// Create a new RTCPeerConnection
	wp.pc, err = webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				// Google's STUN server (fallback)
				// URLs: []string{"stun:stun.l.google.com:19302"},
			},
		},
	})
	if err != nil {
		return nil, err
	}
	wp.localTrackChan = make(chan *webrtc.TrackLocalStaticRTP)

	return wp, nil
}

func (wp *WebRTCPeer) SetupPublisher(offer webrtc.SessionDescription, onStateChange func(connectionState webrtc.ICEConnectionState), onTrack func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver), onIceCandidate func(c *webrtc.ICECandidate)) (answer webrtc.SessionDescription, err error) {

	// Allow us to receive 1 audio track
	if _, err = wp.pc.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio); err != nil {
		return
	}

	wp.pc.OnICEConnectionStateChange(onStateChange)
	wp.pc.OnTrack(onTrack)
	wp.pc.OnICECandidate(onIceCandidate)

	// Set the remote SessionDescription
	if err = wp.pc.SetRemoteDescription(offer); err != nil {
		return
	}

	// Sets the LocalDescription, and starts our UDP listeners
	answer, err = wp.pc.CreateAnswer(nil)
	if err != nil {
		return
	}

	err = wp.pc.SetLocalDescription(answer)
	if err != nil {
		return
	}

	return
}

// SetupSubscriber completes the subscriber WebRTC session setup.
// Earlier we called webrtc.SetRemoteDescription() to allow ICE to kick off
func (wp *WebRTCPeer) SetupSubscriber(channel *Channel, onStateChange func(connectionState webrtc.ICEConnectionState), onIceCandidate func(c *webrtc.ICECandidate)) (answer webrtc.SessionDescription, err error) {

	// Add tracks from all publishers in the channel
	var rtpSenders []*webrtc.RTPSender
	for publisherID, publisher := range channel.Publishers {
		rtpSender, addTrackErr := wp.pc.AddTrack(publisher.LocalTrack)
		if addTrackErr != nil {
			slog.Error("Failed to add track from publisher", "publisher_id", publisherID, "err", addTrackErr)
			continue
		}
		rtpSenders = append(rtpSenders, rtpSender)
	}

	if len(rtpSenders) == 0 {
		return answer, fmt.Errorf("no valid publishers found in channel")
	}

	// Read incoming RTCP packets for each sender
	// Before these packets are returned they are processed by interceptors. For things
	// like NACK this needs to be called.
	for _, rtpSender := range rtpSenders {
		go func(sender *webrtc.RTPSender) {
			rtcpBuf := make([]byte, 1500)
			for {
				_, _, rtcpErr := sender.Read(rtcpBuf)
				if rtcpErr != nil {
					if !errors.Is(rtcpErr, io.EOF) {
						slog.Error("rtpSender.Read error", "err", rtcpErr)
					}
					return
				}
			}
		}(rtpSender)
	}

	wp.pc.OnICEConnectionStateChange(onStateChange)
	wp.pc.OnICECandidate(onIceCandidate)

	// Sets the LocalDescription, and starts our UDP listeners
	answer, err = wp.pc.CreateAnswer(nil)
	if err != nil {
		return
	}

	ldErr := wp.pc.SetLocalDescription(answer)
	if ldErr != nil {
		err = ldErr
		return
	}

	return
}
