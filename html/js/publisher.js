var localStream;
var audioTrack;

document.getElementById('reload').addEventListener('click', function () {
	window.location.reload(false);
});

document.getElementById('microphone').addEventListener('click', function () {
	toggleMic()
});

var toggleMic = function () {
	var micEle = document.getElementById('microphone');
	micEle.classList.toggle('icon-mute');
	micEle.classList.toggle('icon-mic');
	micEle.classList.toggle('on');
	audioTrack.enabled = micEle.classList.contains('icon-mic');
}

document.getElementById('input-form').addEventListener('submit', function (e) {
	e.preventDefault();

	document.getElementById('output').classList.remove('hidden');
	document.getElementById('input-form').classList.add('hidden');
	var params = {};

	params.Channel = document.getElementById('channel').value;
	params.Password = document.getElementById('password').value;
	var val = {
		Key: 'connect_publisher',
		Value: params
	};
	wsSend(val)
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
	soundMeter.stop()
	getUserMedia(constraints)
})

ws.onmessage = function (e) {
	var wsMsg = JSON.parse(e.data);
	if ('Key' in wsMsg) {
		switch (wsMsg.Key) {
			case 'info':
				debug("server info", wsMsg.Value);
				break;
			case 'error':
				error("server error", wsMsg.Value);
				document.getElementById('output').classList.add('hidden');
				document.getElementById('input-form').classList.add('hidden');
				break;
			case 'sd_answer':
				startSession(wsMsg.Value);
				break;
		}
	}
};

ws.onclose = function () {
	debug("WS connection closed");
	if (audioTrack) {
		audioTrack.stop()
	}
	pc.close()
};

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
	navigator.mediaDevices.getUserMedia(constraints)
		.then(stream => {
			localStream = stream

			audioTrack = stream.getAudioTracks()[0];
			if (!sender) {
				sender = pc.addTrack(audioTrack)
				// mute until we're ready
				audioTrack.enabled = false;
			} else {
				sender.replaceTrack(audioTrack)
			}

			soundMeter = new SoundMeter(new AudioContext());
			soundMeter.connectToSource(stream, function (e) {
				if (e) {
					alert(e);
					return;
				}

				// make the meter value relative to a sliding max
				var max = 0.0
				setInterval(() => {
					var val = soundMeter.instant.toFixed(2)
					if (val > max) {
						max = val
					}
					if (max > 0) {
						val = (val / max)
					}
					signalMeter.value = val
				}, 50);
			});
		})
		.catch(debug)
}

pc.onnegotiationneeded = e =>
	pc.createOffer().then(d => pc.setLocalDescription(d)).catch(debug)

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