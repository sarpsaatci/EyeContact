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

// window.speechSynthesis.onspeaking = function() {
//   this.cancel();
// }

var registerName = null;
const NOT_REGISTERED = 0;
const REGISTERING = 1;
const REGISTERED = 2;
var registerState = null;

var currentUser = null;
var contacts = null;
var contactNames = new Array();
var dbcontacts = null;

var readyToCaptureFrame = false;

var outImg = new Image();

var synth = window.speechSynthesis;
var chime = null;
var emoAudio = null;

var autocompleteItems = new Array;
let autoCompleteItemCount = 0;

var uterance = new SpeechSynthesisUtterance('please say the contact name to call');

settingsDefault = true;

var settings = null;

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
	// console = new Console();
	setRegisterState(NOT_REGISTERED);
	var drag = new Draggabilly(document.getElementById('videoSmall'));
	videoInput = document.getElementById('videoInput');
	videoOutput = document.getElementById('videoOutput');
	// document.getElementById('name').focus();

	// document.getElementById('register').addEventListener('click', function() {
	// 	register();
	// });
	// document.getElementById('call').addEventListener('click', function() {
	// 	call();
	// });

  settings = {
    id: 'settings',
    emotion_happiness: 'true',
    emotion_happiness_sensivity: 'medium',
    emotion_sadness: 'true',
    emotion_sadness_sensivity: 'medium',
    emotion_fear: 'true',
    emotion_fear_sensivity: 'medium',
    emotion_disgust: 'true',
    emotion_disgust_sensivity: 'medium',
    emotion_surprised: 'true',
    emotion_surprised_sensivity: 'medium',
    emotion_anger: 'true',
    emotion_anger_sensivity: 'medium',
    emotion_neutral: 'true',
    gaze: 'true',
    gaze_sensivity: 'medium'
  };

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
    // chart.render();
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
    chimeAudio.play();
    synth.speak(new SpeechSynthesisUtterance('tracking started'));
    break;
  case 'openFace':
    console.log(parsedMessage.data);
    if(parsedMessage.data.includes("$")) {

      if(parsedMessage.data.includes('color')) {
        let emoUtter = new SpeechSynthesisUtterance('clothing color is ' + parsedMessage.data.substr(parsedMessage.data.indexOf(';')));
        chime = document.getElementById('chimeAudio');
        chime.play();

        synth.speak(emoUtter);

        emoUtter.onend = function() {
            document.getElementById('videoOutput').volume = 1.0;
        };
        emoUtter.onstart = function() {
          document.getElementById('videoOutput').volume = 0.4;
        };

      }

      else if(parsedMessage.data.includes('happiness')) {
        let emoUtter = new SpeechSynthesisUtterance('happy');
        chime = document.getElementById('chimeAudio');
        chime.play();

        synth.speak(emoUtter);

        emoUtter.onend = function() {
            document.getElementById('videoOutput').volume = 1.0;
        };
        emoUtter.onstart = function() {
          document.getElementById('videoOutput').volume = 0.4;
        };

        // let val = parsedMessage.data.substring(parsedMessage.data.indexOf('-')+1);
        // val = parseFloat(val);
        // if(val) {
        //   emodata[0].y = val;
        //   chart.render();
        // }
      }
      else if(parsedMessage.data.includes('anger')) {
        let emoUtter = new SpeechSynthesisUtterance('angry');
        chime = document.getElementById('chimeAudio');
        chime.play();

        synth.speak(emoUtter);

        emoUtter.onend = function() {
            document.getElementById('videoOutput').volume = 1.0;
        };
        emoUtter.onstart = function() {
          document.getElementById('videoOutput').volume = 0.4;
        };

        // let val = parsedMessage.data.substring(parsedMessage.data.indexOf('-')+1);
        // val = parseFloat(val);
        // if(val) {
        //   emodata[1].y = val;
        //   chart.render();
        // }
      }
      else if(parsedMessage.data.includes('surprise')) {
        let emoUtter = new SpeechSynthesisUtterance('surprised');
        chime = document.getElementById('chimeAudio');
        chime.play();

        synth.speak(emoUtter);

        emoUtter.onend = function() {
            document.getElementById('videoOutput').volume = 1.0;
        };
        emoUtter.onstart = function() {
          document.getElementById('videoOutput').volume = 0.4;
        };

        // let val = parsedMessage.data.substring(parsedMessage.data.indexOf('-')+1);
        // val = parseFloat(val);
        // if(val) {
        //   emodata[2].y = val;
        //   chart.render();
        // }
      }
      else if(parsedMessage.data.includes('sadness')) {
        let emoUtter = new SpeechSynthesisUtterance('sad');
        chime = document.getElementById('chimeAudio');
        chime.play();

        synth.speak(emoUtter);

        emoUtter.onend = function() {
            document.getElementById('videoOutput').volume = 1.0;
        };
        emoUtter.onstart = function() {
          document.getElementById('videoOutput').volume = 0.4;
        };

        // let val = parsedMessage.data.substring(parsedMessage.data.indexOf('-')+1);
        // val = parseFloat(val);
        // if(val) {
        //   emodata[3].y = val;
        //   chart.render();
        // }
      }
      else if(parsedMessage.data.includes('disgust')) {
        let emoUtter = new SpeechSynthesisUtterance('disgust');
        chime = document.getElementById('chimeAudio');
        chime.play();

        synth.speak(emoUtter);

        emoUtter.onend = function() {
            document.getElementById('videoOutput').volume = 1.0;
        };
        emoUtter.onstart = function() {
          document.getElementById('videoOutput').volume = 0.4;
        };

        // let val = parsedMessage.data.substring(parsedMessage.data.indexOf('-')+1);
        // val = parseFloat(val);
        // if(val) {
        //   emodata[4].y = val;
        //   chart.render();
        // }
      }
      else if(parsedMessage.data.includes('fear')) {
        let emoUtter = new SpeechSynthesisUtterance('fear');
        chime = document.getElementById('chimeAudio');
        chime.play();

        synth.speak(emoUtter);

        emoUtter.onend = function() {
            document.getElementById('videoOutput').volume = 1.0;
        };
        emoUtter.onstart = function() {
          document.getElementById('videoOutput').volume = 0.4;
        };

        // let val = parsedMessage.data.substring(parsedMessage.data.indexOf('-')+1);
        // val = parseFloat(val);
        // if(val) {
        //   emodata[5].y = val;
        //   chart.render();
        // }
      }

      else if(parsedMessage.data.includes('left')) {
        let emoUtter = new SpeechSynthesisUtterance('gaze left');
        chime = document.getElementById('chimeAudio');
        chime.play();

        synth.speak(emoUtter);

        emoUtter.onend = function() {
            document.getElementById('videoOutput').volume = 1.0;
        };
        emoUtter.onstart = function() {
          document.getElementById('videoOutput').volume = 0.4;
        };

        renderGauge(-7);
      }

      else if(parsedMessage.data.includes('right')) {
        let emoUtter = new SpeechSynthesisUtterance('gaze right');
        chime = document.getElementById('chimeAudio');
        chime.play();

        synth.speak(emoUtter);

        emoUtter.onend = function() {
            document.getElementById('videoOutput').volume = 1.0;
        };
        emoUtter.onstart = function() {
          document.getElementById('videoOutput').volume = 0.4;
        };

        renderGauge(7);
      }

      else if(parsedMessage.data.includes('neutral')) {
        let emoUtter = new SpeechSynthesisUtterance('neutral');
        chime = document.getElementById('chimeAudio');
        chime.play();

        synth.speak(emoUtter);

        emoUtter.onend = function() {
            document.getElementById('videoOutput').volume = 1.0;
        };
        emoUtter.onstart = function() {
          document.getElementById('videoOutput').volume = 0.4;
        };

        // let val = parsedMessage.data.substring(parsedMessage.data.indexOf('-')+1);
        // val = parseFloat(val);
        // if(val) {
        //     emodata[6].y = val;
        //     chart.render();
        // }
      }
    }
    break;
  case 'getSettings':
    console.log(parsedMessage);
    if(parsedMessage.settings == 'default') {
      register(currentUser, dbcontacts);
      changeSettingsMenu();
    }
    else {
      if(settings = parsedMessage.settings) {
        register(currentUser, dbcontacts);
        changeSettingsMenu();
      }
    }
    break;
  case 'tracking':
    // console.log(parsedMessage);
    let val = parsedMessage.data;
    val = parseFloat(val);
    if(val && !isNaN(val)) {
      if(parsedMessage.emotion == 'happiness') {
        emodata[0].y = val;
        chart.render();
      }
      if(parsedMessage.emotion == 'anger') {
        emodata[1].y = val;
        chart.render();
      }
      if(parsedMessage.emotion == 'surprised') {
        emodata[2].y = val;
        chart.render();
      }
      if(parsedMessage.emotion == 'sadness') {
        emodata[3].y = val;
        chart.render();
      }
      if(parsedMessage.emotion == 'disgust') {
        emodata[4].y = val;
        chart.render();
      }
      if(parsedMessage.emotion == 'fear') {
        emodata[5].y = val;
        chart.render();
      }
      if(parsedMessage.emotion == 'neutral') {
        emodata[6].y = val;
        chart.render();
      }
    }
    break;
	default:
		console.error(parsedMessage);
	}
}

function applySettings(newSettings)
{
  settings = newSettings;
  sendMessage({
    id: 'applySettings',
    user: currentUser,
    contacts: dbcontacts,
    settings: newSettings
  });
}

function setSettings()
{
  sendMessage({
    id: 'setSettings',
    user: currentUser,
    contacts: dbcontacts,
    settings: settings
  });
}

function changeSettingsMenu() {
  if(settings.emotion_anger == 'true') {
      document.getElementById("angerSwitch").checked = true;
  }
  else if(settings.emotion_anger == 'false') {
    document.getElementById("angerSwitch").checked = false;
  }

  if(settings.emotion_disgust == 'true') {
      document.getElementById("disgustSwitch").checked = true;
  }
  else if(settings.emotion_disgust == 'false') {
    document.getElementById("disgustSwitch").checked = false;
  }

  if(settings.emotion_fear == 'true') {
      document.getElementById("fearSwitch").checked = true;
  }
  else if(settings.emotion_fear == 'false') {
    document.getElementById("fearSwitch").checked = false;
  }

  if(settings.emotion_happiness == 'true') {
      document.getElementById("happinessSwitch").checked = true;
  }
  else if(settings.emotion_happiness == 'false') {
    document.getElementById("happinessSwitch").checked = false;
  }

  if(settings.emotion_surprised == 'true') {
      document.getElementById("surpriseSwitch").checked = true;
  }
  else if(settings.emotion_surprised == 'false') {
    document.getElementById("surpriseSwitch").checked = false;
  }

  if(settings.emotion_sadness == 'true') {
      document.getElementById("sadnessSwitch").checked = true;
  }
  else if(settings.emotion_sadness == 'false') {
    document.getElementById("sadnessSwitch").checked = false;
  }

  if(settings.emotion_neutral == 'true') {
      document.getElementById("neutralSwitch").checked = true;
  }
  else if(settings.emotion_neutral == 'false') {
    document.getElementById("neutralSwitch").checked = false;
  }

  if(settings.gaze == 'true') {
      document.getElementById("gazeSwitch").checked = true;
  }
  else if(settings.gaze == 'false') {
    document.getElementById("gazeSwitch").checked = false;
  }

  if(document.getElementById("angerSwitch").checked) {
    if(settings.emotion_anger_sensivity == 'low') {
        angerSwitchClicked();
        clickedAngerLow();
    }
    else if(settings.emotion_anger_sensivity == 'medium') {
      angerSwitchClicked();
      clickedAngerMedium();
    }
    else if(settings.emotion_anger_sensivity == 'high') {
      angerSwitchClicked();
      clickedAngerHigh();
    }
  }

  if(document.getElementById("disgustSwitch").checked) {
    if(settings.emotion_disgust_sensivity == 'low') {
      disgustSwitchClicked();
      clickedDisgustLow();
    }
    else if(settings.emotion_disgust_sensivity == 'medium') {
      disgustSwitchClicked();
      clickedDisgustMedium();
    }
    else if(settings.emotion_disgust_sensivity == 'high') {
      disgustSwitchClicked();
      clickedDisgustHigh();
    }
  }

  if(document.getElementById("fearSwitch").checked) {
    if(settings.emotion_fear_sensivity == 'low') {
      fearSwitchClicked();
      clickedFearLow();
    }
    else if(settings.emotion_fear_sensivity == 'medium') {
      fearSwitchClicked();
      clickedFearMedium();
    }
    else if(settings.emotion_fear_sensivity == 'high') {
      fearSwitchClicked();
      clickedFearHigh();
    }
  }

  if(document.getElementById("surpriseSwitch").checked) {
    if(settings.emotion_surprised_sensivity == 'low') {
      surpriseSwitchClicked();
      clickedSurpriseLow();
    }
    else if(settings.emotion_surprised_sensivity == 'medium') {
      surpriseSwitchClicked();
      clickedSurpriseMedium();
    }
    else if(settings.emotion_surprised_sensivity == 'high') {
      surpriseSwitchClicked();
      clickedSurpriseHigh();
    }
  }

  if(document.getElementById("sadnessSwitch").checked) {
    if(settings.emotion_anger_sensivity == 'low') {
      sadnessSwitchClicked();
      clickedSadnessLow();
    }
    else if(settings.emotion_sadness_sensivity == 'medium') {
      sadnessSwitchClicked();
      clickedSadnessMedium();
    }
    else if(settings.emotion_sadness_sensivity == 'high') {
      sadnessSwitchClicked();
      clickedSadnessHigh();
    }
  }

  if(document.getElementById("happinessSwitch").checked) {
    if(settings.emotion_happiness_sensivity == 'low') {
      happinessSwitchClicked();
      clickedHappinessLow();
    }
    else if(settings.emotion_happiness_sensivity == 'medium') {
      happinessSwitchClicked();
      clickedHappinessMedium();
    }
    else if(settings.emotion_happiness_sensivity == 'high') {
      happinessSwitchClicked();
      clickedHappinessHigh();
    }
  }

  if(document.getElementById("gazeSwitch").checked) {
    if(settings.gaze_sensivity == 'low') {
      gazeSwitchClicked();
      clickedSensLow();
    }
    else if(settings.gaze_sensivity == 'medium') {
      gazeSwitchClicked();
      clickedSensMedium();
    }
    else if(settings.gaze_sensivity == 'high') {
      gazeSwitchClicked();
      clickedSensHigh();
    }
  }

}

function speakAutocompleteItems(items)
{

  console.log(items.length);

  items.forEach(function(item) {
    console.log(item);
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(item));
  });

  let uter = new SpeechSynthesisUtterance('please say your choice');

  uter.onend = function(event) {

    if (window.hasOwnProperty('webkitSpeechRecognition')) {

      var recognition = new webkitSpeechRecognition();

      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.lang = "en-US";
      recognition.start();

      recognition.onstart = function(e) {
        document.getElementById('chimeAudio').play();
      }

      recognition.onresult = function(e) {
        console.log(e.results[0][0].transcript);
        let number = parseInt(e.results[0][0].transcript);
        recognition.stop();
        if(items[number-1]) {
          let peer = items[number-1];
          makeCall(peer.substring(peer.indexOf('(')+1, peer.indexOf(')')));
        }
        else {
          speechRecognize();
        }
      };

      recognition.onerror = function(e) {
        recognition.stop();
      }
    }
  }

  window.speechSynthesis.speak(uter);
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
  sendMessage({
    id: 'applySettings',
    user: currentUser,
    contacts: dbcontacts,
    settings: settings
  });

  // sendMessage({
  //   id: 'getSettings',
  //   email: currentUser.email.$t
  // });

  // if(recognition) {
  //   recognition.stop();
  //   window.speechSynthesis.cancel();
  // }

  // if (recognition) {
  //   recognition.abort();
  // }

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

// function lineChart(dataset)
// {
//
//
// }

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

  dbcontacts = new Array();

  contacts.forEach(function(contact) {
    if(contact.title && contact.gd$email) {
      contactNames.push('' + contact.title.$t + ' (' + contact.gd$email[0].address + ')');
      dbcontacts.push({
        name: contact.title.$t,
        email: contact.gd$email[0].address
      });
    }
  });

  synth = window.speechSynthesis;
  let utterThis = new SpeechSynthesisUtterance("Hello" + currentUser.name.$t.substr(0, currentUser.name.$t.indexOf(' ')) + ", welcome to EyeContact");

  // synth.style = -100;

  synth.speak(utterThis);

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
  speechRecognize();
  changeSettingsMenu();
}

function speechRecognize() {

    if (window.hasOwnProperty('webkitSpeechRecognition')) {

      let recognition = new webkitSpeechRecognition();

      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.lang = "en-US";
      window.speechSynthesis.speak(uterance);
      uterance.onend = function(e) {
          console.log("asdasdafs");
          recognition.abort();
          recognition.start();
      }


      recognition.onstart = function(e) {
        document.getElementById('chimeAudio').play();
      }

      recognition.onresult = function(e) {
        var evt = document.createEvent('HTMLEvents');
        evt.initEvent('input', true, true);
        document.getElementById('myInput').contentEditable = "true";
        document.getElementById('myInput').value = e.results[0][0].transcript;
        if(document.getElementById('myInput').dispatchEvent(evt)) {
              document.getElementById('myInput').focus();
              if(autocompleteItems.length == 0) {
                let ut = new SpeechSynthesisUtterance('contact cannot be found');
                window.speechSynthesis.speak(ut);
                ut.onend = function(e) {
                    recognition.abort();
                    speechRecognize();
                }
              }
              if(autocompleteItems.length > 0) {
                speakAutocompleteItems(autocompleteItems);
                recognition.abort();
              }
        }
      };

      recognition.onnomatch = function(e) {
        recognition.abort();
        return speechRecognize();
      }

      recognition.onerror = function(e) {
        recognition.abort();
      }
    }
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
    let utter = new SpeechSynthesisUtterance(errorMessage);
    window.speechSynthesis.speak(utter);
    utter.onend = function(e) {
      speechRecognize();
    }
		stop(true);
	} else {
		setCallState(IN_CALL);
		webRtcPeer.processAnswer(message.sdpAnswer);

    document.getElementById('dialPage').style.display = "none";
    document.getElementById('activePage').style.display = "block";

    window.speechSynthesis.speak(new SpeechSynthesisUtterance('call started'));

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
	// document.getElementById('peer').focus();
}

function call(peerEmail) {

  if(window.speechSynthesis.pending()) {
      window.speechSynthesis.cancel();
  }
  window.speechSynthesis.speak(new SpeechSynthesisUtterance('calling'));

	setCallState(PROCESSING_CALL);

  document.getElementById('callPage').style.display = 'none';
  document.getElementById('dialPage').style.display = 'block';

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

  if(window.speechSynthesis.pending()) {
      window.speechSynthesis.cancel();
  }
  window.speechSynthesis.speak(new SpeechSynthesisUtterance('call ended'));

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

  document.getElementById('activePage').style.display = "none";
  document.getElementById('dialPage').style.display = 'none';
  document.getElementById('callPage').style.display = "block";
  document.getElementById('myInput').value = "";
  speechRecognize();

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
