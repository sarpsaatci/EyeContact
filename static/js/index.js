/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var ws = new WebSocket('wss://' + location.host + '/one2one');
var videoInput;
var videoOutput;
var webRtcPeer;

var registerName = null;
const NOT_REGISTERED = 0;
const REGISTERING = 1;
const REGISTERED = 2;
var registerState = null;

var currentUser = null;
var contacts = null;
var contactNames = new Array();

var readyToCaptureFrame = false;

var outImg = new Image();

var synth = window.speechSynthesis;
var chime = null;
var emoAudio = null;

var settings = {
  id: 'settings',
  emotion_happiness: true,
  emotion_happiness_sensitivity: 'medium',
  emotion_sadness: true,
  emotion_sadness_sensitivity: 'medium',
  emotion_fear: true,
  emotion_fear_sensitivity: 'medium',
  emotion_disgust: true,
  emotion_disgust_sensitivity: 'medium',
  emotion_surprised: true,
  emotion_surprised_sensitivity: 'medium',
  emotion_angry: true,
  emotion_angry_sensitivity: 'medium',
  gaze: 'true',
  gaze_sensitivity: 'medium'
}

function captureVideoFrame(video, format, path) {
        if (typeof video === 'string') {
            video = document.getElementById(video);
        }

        format = format || 'jpeg';

        if (!video || (format !== 'png' && format !== 'jpeg')) {
            return false;
        }

        var canvas = document.createElement("CANVAS");

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        canvas.getContext('2d').drawImage(video, 0, 0);

        // var frameBlob;
        //
        // if (canvas.toBlob) {
        //     frameBlob = canvas.toBlob(
        //         function (blob) {
        //             //frameBlob = blob;
        //             // Do something with the blob object,
        //             // e.g. creating a multipart form for file uploads:
        //             var formData = new FormData();
        //             formData.append('file', blob, path);
        //             /* ... */
        //         },
        //         'image/jpeg'
        //     );
        // }
        //
        // console.log(frameBlob);
        //
        // return frameBlob;

        //var blob = canvas.toBlob();

        var dataUri = canvas.toDataURL('image/' + format);
        var type = 'image/' + format;
        var data = dataUri.split(',')[1];
        var mimeType = dataUri.split(';')[0].slice(5);

        var bytes = window.atob(data);
        var buf = new ArrayBuffer(bytes.length);
        var arr = new Uint8Array(buf);

        return { buf: buf, dataUri: dataUri, type: type };

        // return { buf: buf, dataUri: dataUri, type: type };

        // for (var i = 0; i < bytes.length; i++) {
        //     arr[i] = bytes.charCodeAt(i);
        // }

        // var blob = new Blob([ arr ], { type: mimeType });
        //console.log(blob);
        //
        // //var file = new File(blob, "/images/" + path, [type: 'image/' + format]);
        // //
        // // console.log(file);
        //
        // var formData = new FormData();
        // formData.append("blob", blob, path);
        //return { blob: blob, dataUri: dataUri, format: format };
        // return { dataUri: dataUri, type: type };
        //return blob;
}

function setRegisterState(nextState) {
	switch (nextState) {
	case NOT_REGISTERED:
		$('#register').attr('disabled', false);
		$('#call').attr('disabled', true);
		$('#terminate').attr('disabled', true);
		break;

	case REGISTERING:
		$('#register').attr('disabled', true);
		break;

	case REGISTERED:
		$('#register').attr('disabled', true);
		setCallState(NO_CALL);
		break;

	default:
		return;
	}
	registerState = nextState;
}

const NO_CALL = 0;
const PROCESSING_CALL = 1;
const IN_CALL = 2;
var callState = null

function setCallState(nextState) {
	switch (nextState) {
	case NO_CALL:
		$('#call').attr('disabled', false);
		$('#terminate').attr('disabled', true);
		break;

	case PROCESSING_CALL:
		$('#call').attr('disabled', true);
		$('#terminate').attr('disabled', true);
		break;
	case IN_CALL:
		$('#call').attr('disabled', true);
		$('#terminate').attr('disabled', false);
		break;
	default:
		return;
	}
	callState = nextState;
}

window.onload = function() {
	console = new Console();
	setRegisterState(NOT_REGISTERED);
	var drag = new Draggabilly(document.getElementById('videoSmall'));
	videoInput = document.getElementById('videoInput');
	videoOutput = document.getElementById('videoOutput');
	// document.getElementById('name').focus();

	// document.getElementById('register').addEventListener('click', function() {
	// 	register();
	// });
	document.getElementById('call').addEventListener('click', function() {
		call();
	});
	document.getElementById('terminate').addEventListener('click', function() {
		stop();
	});
}

window.onbeforeunload = function() {
	ws.close();
}

ws.onmessage = function(message) {

	// console.log();


	// console.log();


	console.log();

	var parsedMessage = JSON.parse(message.data);
	// console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
	case 'registerResponse':
		resgisterResponse(parsedMessage);
		break;
	case 'callResponse':
		callResponse(parsedMessage);
		break;
	case 'incomingCall':
		incomingCall(parsedMessage);
		break;
	case 'startCommunication':
		startCommunication(parsedMessage);
		break;
	case 'stopCommunication':
		console.info("Communication ended by remote peer");
		stop(true);
		break;
	case 'iceCandidate':
		webRtcPeer.addIceCandidate(parsedMessage.candidate);
		break;
  case 'frame':
    if(parsedMessage.imgCount > 1)
    {
      readyToCaptureFrame = true;
    }
    console.log("Get FRAME: " + parsedMessage.imgCount);
    break;
  case 'frameUrl':
    console.log(message);
    break;
  case 'output':
    // console.log("aha aha aha");
    printOutput(parsedMessage);
    break;
  case 'user':
    // console.log(parsedMessage);
    // document.getElementById('name').value = parsedMessage.currentUser.name.$t.substr(0, parsedMessage.currentUser.name.$t.indexOf(' '));
    break;
  case 'capture':
    console.log(parsedMessage.id);
    readyToCaptureFrame = true;
    break;
  case 'openFace':
    console.log(parsedMessage.data);
    if(parsedMessage.data.includes("-")) {
      let emoUtter = new SpeechSynthesisUtterance(parsedMessage.data.substring(parsedMessage.data.indexOf('$')+1, parsedMessage.data.indexOf('-')));
      chime = document.getElementById('chimeAudio');
      chime.play();

      emoUtter.onend = function() {
          document.getElementById('videoOutput').volume = 1.0;
      };
      emoUtter.onstart = function() {
        document.getElementById('videoOutput').volume = 0.4;
      };

      synth.speak(emoUtter);
    }
    // dummyFace(parsedMessage.data);
    break;
  casev
	default:
		console.error(parsedMessage);
	}
}

function speakAutocompleteItems(itemsCount)
{

  for(i = 0; i < itemsCount; i++) {
    item = document.getElementById('myInput-autocomplete-item' + i);
    if(item) {
      setTimeout(function() {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(item.getElementsByTagName("input")[0].value));
      }, 1000);
    }
  }

}

function dummyFace(line)
{
  if(line.includes('anger'))
    myfunc2(1);
  else if(line.includes('fear'))
    myfunc2(2);
  else if(line.includes('happiness'))
    myfunc2(3);
  else if(line.includes('sadness'))
    myfunc2(4);
  else if(line.includes('disgust'))
    myfunc2(5);
  else if(line.includes('surprised'))
    myfunc2(6);
  else {
    myfunc2(7);
  }

}

function makeCall(peerEmail)
{
  call(peerEmail);
}

function getFrames()
{
  videoOutput.ontimeupdate = function() {
    if(videoOutput.currentTime != 0 && readyToCaptureFrame) {
      console.log("time: " + videoOutput.currentTime);
      path = "frame_" + (videoOutput.currentTime | 0);
      frameBuf = captureVideoFrame(videoOutput, null, path);

      frame = {
        id : 'frame',
        path : path,
        buf : frameBuf
      };
      readyToCaptureFrame = false;
      sendMessage(frame);
    }
  };
}

function manageUser(userData)
{

  // Current user full name with (currentUser.name.$t)
  currentUser = userData.feed.author[0];

  // contacts array (get each contact as string  with contacts[0].title.$t)
  contacts = userData.feed.entry;

  contacts.forEach(function(element) {
    if(!element.gd$email || element.title.$t == "")
      contacts.splice(contacts.indexOf(element), 1);
  });

  contacts.forEach(function(contact) {
    if(contact.gd$email) {
      console.log(contact.title.$t);
      console.log(contact.gd$email[0].address);
    }
  });

  console.log(currentUser);
  console.log(contacts);

  let dbcontacts = new Array();

  contacts.forEach(function(contact) {
    if(contact.title && contact.gd$email) {
      contactNames.push('' + contact.title.$t + ' (' + contact.gd$email[0].address + ')');
      dbcontacts.push({
        name: contact.title.$t,
        email: contact.gd$email[0].address
      });
    }
  });

  sendMessage({
    id : 'userLogin',
    currentUser : currentUser,
    contacts : dbcontacts,
    settings: settings
  });

  synth = window.speechSynthesis;
  let utterThis = new SpeechSynthesisUtterance("Hello" + currentUser.name.$t.substr(0, currentUser.name.$t.indexOf(' ')) + ", welcome to EyeContact");

  // synth.style = -100;

  synth.speak(utterThis);

  register(currentUser, dbcontacts);

  sendMessage({
    id: 'getSettings',
    email: currentUser.email.$t
  });


}

function activatePage()
{
  document.getElementById("authPage").style.display = "none";
  document.getElementById("callPage").style.display = "block";
  document.getElementById("myInput").focus();
}

function printOutput(message)
{
  console.log(message.fileName);
  outImg.src = message.imgData;
  // document.getElementById('output').appendChild(outImg);
}

function resgisterResponse(message) {
	if (message.response == 'accepted') {
		setRegisterState(REGISTERED);
	} else {
		setRegisterState(NOT_REGISTERED);
		var errorMessage = message.message ? message.message
				: 'Unknown reason for register rejection.';
		console.log(errorMessage);
		alert('Error registering user. See console for further information.');
	}
}

function callResponse(message) {
	if (message.response != 'accepted') {
		console.info('Call not accepted by peer. Closing call');
		var errorMessage = message.message ? message.message
				: 'Unknown reason for call rejection.';
		console.log(errorMessage);
		stop(true);
	} else {
		setCallState(IN_CALL);
		webRtcPeer.processAnswer(message.sdpAnswer);

    document.getElementById('callPage').style.display = "none";
    document.getElementById('activePage').style.display = "block";

    showSpinner(videoInput, videoOutput);

    readyToCaptureFrame = true;
    getFrames();
	}
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	// console.log('Senging message: ' + jsonMessage);
  // console.log(JSON.parse(jsonMessage)); // stringify ederken blobu kaybediyoruz
	ws.send(jsonMessage);
}

function startCommunication(message) {
	setCallState(IN_CALL);

  console.log("startCom MESSAGE");
  console.log(message);

	webRtcPeer.processAnswer(message.sdpAnswer);
}

function incomingCall(message) {

  document.getElementById('callPage').style.display = "none";
  document.getElementById('activePage').style.display = "block";

  // If bussy just reject without disturbing user
	if (callState != NO_CALL) {
		var response = {
			id : 'incomingCallResponse',
			from : message.from,
			callResponse : 'reject',
			message : 'bussy'
		};
		return sendMessage(response);
	}

	setCallState(PROCESSING_CALL);
	if (confirm('User ' + message.from
			+ ' is calling you. Do you accept the call?')) {
		showSpinner(videoInput, videoOutput);

		var options = {
			localVideo : videoInput,
			remoteVideo : videoOutput,
			onicecandidate : onIceCandidate
		}

		webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options,
				function(error) {
					if (error) {
						console.error(error);
						setCallState(NO_CALL);
					}

					this.generateOffer(function(error, offerSdp) {
						if (error) {
							console.error(error);
							setCallState(NO_CALL);
						}
						var response = {
							id : 'incomingCallResponse',
							from : message.from,
							callResponse : 'accept',
							sdpOffer : offerSdp
						};
						sendMessage(response);
					});
				});

	} else {
		var response = {
			id : 'incomingCallResponse',
			from : message.from,
			callResponse : 'reject',
			message : 'user declined'
		};
		sendMessage(response);
		stop(true);
	}
}

function register(currentUser, contacts) {

	setRegisterState(REGISTERING);

	var message = {
		id : 'register',
		currentUser : currentUser,
    contacts : contacts,
    settings: settings
	};
	sendMessage(message);
	document.getElementById('peer').focus();
}

function call(peerEmail) {

	setCallState(PROCESSING_CALL);

	var options = {
		localVideo : videoInput,
		remoteVideo : videoOutput,
		onicecandidate : onIceCandidate
	}

	webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function(
			error) {
		if (error) {
			console.error(error);
			setCallState(NO_CALL);
		}

		this.generateOffer(function(error, offerSdp) {
			if (error) {
				console.error(error);
				setCallState(NO_CALL);
			}
			var message = {
				id : 'call',
				from : currentUser.email.$t,
				to : peerEmail,
				sdpOffer : offerSdp
			};
			sendMessage(message);
		});
	});
}

function stop(message) {
	setCallState(NO_CALL);
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;

		if (!message) {
			var message = {
				id : 'stop'
			}
			sendMessage(message);
		}
	}


  var element = document.getElementById('output');
  outImg.src = "";
	hideSpinner(videoInput, videoOutput);
}

function onIceCandidate(candidate) {
	// console.log('Local candidate' + JSON.stringify(candidate));

	var message = {
		id : 'onIceCandidate',
		candidate : candidate
	}
	sendMessage(message);
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = 'img/transparent-1px.png';
		arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = './img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});
