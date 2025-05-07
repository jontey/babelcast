var audioTrack;

document.getElementById('reload').addEventListener('click', function () {
	window.location.reload(false);
});

document.getElementById('microphone').addEventListener('click', function () {
	toggleMic()
});

var toggleMic = function() {
	let micEle = document.getElementById('microphone');
	micEle.classList.toggle('icon-mute');
	micEle.classList.toggle('icon-mic');
	micEle.classList.toggle('on');
	audioTrack.enabled = micEle.classList.contains('icon-mic');
}

document.getElementById('input-form').addEventListener('submit', function (e) {
	e.preventDefault();

	document.getElementById('output').classList.remove('hidden');
	document.getElementById('input-form').classList.add('hidden');
	
	// Set the selected channel name in the title
	const channelName = document.getElementById('channel').value;
	document.getElementById('selected-channel-name').innerText = channelName;
	
	let params = {};
	params.Channel = channelName;
	params.Password = document.getElementById('password').value;
	let val = {Key: 'connect_publisher', Value: params};
	wsSend(val);
});

document.getElementById('audioInputSelect').addEventListener('change', function (e) {
	e.preventDefault()

	const constraints = window.constraints = {
		audio: {
			deviceId: {
				exact: e.target.value
			}
		},
		video: false
	};
	if (soundMeter) {
		soundMeter.stop()
	}
	getUserMedia(constraints)
})

ws.onmessage = function (e)	{
	let wsMsg = JSON.parse(e.data);
	if( 'Key' in wsMsg ) {
		switch (wsMsg.Key) {
			case 'info':
				debug("server info: " + wsMsg.Value);
				break;
			case 'error':
				error("server error", wsMsg.Value);
				document.getElementById('output').classList.add('hidden');
				document.getElementById('input-form').classList.add('hidden');
				break;
			case 'sd_answer':
				startSession(wsMsg.Value);
				break;
			case 'ice_candidate':
				pc.addIceCandidate(wsMsg.Value)
				break;
			case 'password_required':
				document.getElementById('password-form').classList.remove('hidden');
				break;
		}
	}
};

// Store channel information for reconnection
var currentChannel = '';
var currentPassword = '';

// Update the connect_publisher event handler to store channel information
let originalSubmitHandler = document.getElementById('input-form').onsubmit;
document.getElementById('input-form').addEventListener('submit', function (e) {
	currentChannel = document.getElementById('channel').value;
	currentPassword = document.getElementById('password').value;
});

// Variable to track reconnection attempts
var reconnectionInterval = null;

ws.onclose = function()	{
	error("websocket connection closed");
	debug("ws: connection closed");
	
	// Close the peer connection but don't stop the audio track
	pc.close();
	
	// Only attempt to reconnect if we were previously connected to a channel
	if (currentChannel) {
		// Clear any existing reconnection interval
		if (reconnectionInterval) {
			clearInterval(reconnectionInterval);
		}
		
		// Attempt to reconnect after a short delay
		reconnectionInterval = setInterval(function() {
			debug("Attempting to reconnect...");
			
			// Create a new WebSocket and check if it connects successfully
			let testWs = new WebSocket(ws_uri);
			
			testWs.onopen = function() {
				debug("Connection restored!");
				
				// Connection successful, clear the interval
				clearInterval(reconnectionInterval);
				reconnectionInterval = null;
				
				// Replace the main WebSocket with the test one
				ws = testWs;
				
				// Reinitialize WebSocket event handlers
				initializeWebSocketHandlers();
				
				// Reconnect to the same channel
				// Set the selected channel name in the title
				document.getElementById('selected-channel-name').innerText = currentChannel;
				
				let params = {
					Channel: currentChannel,
					Password: currentPassword
				};
				let val = {Key: 'connect_publisher', Value: params};
				wsSend(val);
				
				// Create a new peer connection with the same config as the original
				pc = new RTCPeerConnection({
					iceServers: [
						{
							urls: 'stun:stun.l.google.com:19302'
						}
					]
				});
				initializePeerConnection();
				
				// Re-add the audio track if it exists
				if (audioTrack && sender) {
					sender = pc.addTrack(audioTrack);
				}
			};
			
			testWs.onerror = function() {
				debug("Server still unavailable, will retry...");
				testWs.close();
			};
		}, 3000);
	} else if (audioTrack) {
		// If we weren't connected to a channel, stop the audio track
		audioTrack.stop();
		
		// Also stop the sound meter if it exists
		if (soundMeter) {
			soundMeter.stop();
		}
	}
};

// Function to initialize WebSocket event handlers
function initializeWebSocketHandlers() {
	ws.onmessage = function (e) {
		let wsMsg = JSON.parse(e.data);
		if( 'Key' in wsMsg ) {
			switch (wsMsg.Key) {
				case 'info':
					debug("server info: " + wsMsg.Value);
					break;
				case 'error':
					error("server error", wsMsg.Value);
					document.getElementById('output').classList.add('hidden');
					document.getElementById('input-form').classList.add('hidden');
					break;
				case 'sd_answer':
					startSession(wsMsg.Value);
					break;
				case 'ice_candidate':
					pc.addIceCandidate(wsMsg.Value)
					break;
				case 'password_required':
					document.getElementById('password-form').classList.remove('hidden');
					break;
			}
		}
	};
	
	ws.onclose = onclose;
}

// Function to initialize peer connection event handlers
function initializePeerConnection() {
	pc.onicecandidate = function(e) {
		if (!e.candidate) { return }
		let val = {Key: 'ice_candidate', Value: e.candidate}
		wsSend(val);
	};
	
	pc.oniceconnectionstatechange = function() {
		debug("webrtc: ice connection state: " + pc.iceConnectionState);
	};
	
	pc.ontrack = function(event) {
		debug("webrtc: ontrack");
	};
}

//
// -------- WebRTC ------------
//

const constraints = window.constraints = {
	audio: true,
	video: false
};

try {
	window.AudioContext = window.AudioContext || window.webkitAudioContext;
	window.audioContext = new AudioContext();
} catch (e) {
	alert('Web Audio API not supported.');
}

const signalMeter = document.querySelector('#microphone-meter meter');

var soundMeter;
var sender;

function getUserMedia(constraints) {
	navigator.mediaDevices.getUserMedia(constraints).then(stream => {
		audioTrack = stream.getAudioTracks()[0];
		if (!sender) {
			sender = pc.addTrack(audioTrack)
			// mute until we're ready
			audioTrack.enabled = false;
		} else {
			sender.replaceTrack(audioTrack)
		}

		// Assign to the global soundMeter variable
		soundMeter = new SoundMeter(window.audioContext);
		soundMeter.connectToSource(stream, function(e) {
			if (e) {
				alert(e);
				return;
			}

			// make the meter value relative to a sliding max
			let max = 0.0;
			setInterval(() => {
				let val = soundMeter.instant.toFixed(2);
				if( val > max ) { max = val }
				if( max > 0) { val = (val / max) }
				signalMeter.value = val;
			}, 50);
		});

		let f = () => {
			debug("webrtc: create offer")
			pc.createOffer().then(d => {
				debug("webrtc: set local description")
				pc.setLocalDescription(d);
				let val = { Key: 'session_publisher', Value: d };
				wsSend(val);
			}).catch(debug)
		}
		// create offer if WS is ready, otherwise queue 
		ws.readyState == WebSocket.OPEN ? f() : onWSReady.push(f)

	}).catch(debug)
}

function enumerateDevices() {
	navigator.mediaDevices.enumerateDevices()
		.then((deviceInfos) => {
			var audioInputSelect = document.getElementById('audioInputSelect');

			for (var i = 0; i !== deviceInfos.length; ++i) {
				var deviceInfo = deviceInfos[i];
				var option = document.createElement('option');
				option.value = deviceInfo.deviceId;
				if (deviceInfo.kind === 'audioinput') {
					option.text = deviceInfo.label ||
						'Microphone ' + (audioInputSelect.length + 1);
					audioInputSelect.appendChild(option);
					// } else if (deviceInfo.kind === 'audiooutput') {
					// 		option.text = deviceInfo.label || 'Speaker ' +
					// 		(audioOutputSelect.length + 1);
					// 		audioOutputSelect.appendChild(option);
					// } else if (deviceInfo.kind === 'videoinput') {
					// 		option.text = deviceInfo.label || 'Camera ' +
					// 		(videoSelect.length + 1);
					// 		videoSelect.appendChild(option);
				}
			}
		})
		.catch(debug);
}

// init
enumerateDevices()
getUserMedia(constraints)

window.onbeforeunload = function () {
	return "Are you sure you want to navigate away?";
}