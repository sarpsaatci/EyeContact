/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
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

var path = require('path');
var express = require('express');
var ws = require('ws');
var minimist = require('minimist');
var url = require('url');
var kurento = require('kurento-client');
var fs    = require('fs');
var https = require('https');
var http = require('http');
var blobUtil = require('blob-util');
var fileSaver = require('file-saver');
var toBuffer = require('typedarray-to-buffer');
var Buffer = require('buffer/').Buffer;
var imageDataURI = require('image-data-uri');
var fse = require('fs-extra');
var cp = require('child_process');
var shell = require('shelljs');
var nbind = require('nbind');
var lib = nbind.init().lib;
var fswatch = require('chokidar');
var follow = require('text-file-follower');
const mongoose = require('mongoose');
var WordToNumber = require( "word-to-number-node" );

var w2n = new WordToNumber();

var newSettings = null;



var userSchema = mongoose.Schema({
  name: String,
  email: String,
  contacts: Object,
  settings: Object
});
userSchema.index({ email: 1}, { unique: true });

var User = mongoose.model('User', userSchema);

var argv = minimist(process.argv.slice(2), {
  default: {
      as_uri: "https://localhost:443/",
      ws_uri: "ws://localhost:8888/kurento",
	  //file_uri: "file:///tmp/output/kurento-hello-world-recording.wmv"
  }
});

var options =
{
  key:  fs.readFileSync('keys/server.key'),
  cert: fs.readFileSync('keys/server.crt'),
  pem: fs.readFileSync('keys/server.pem')
};

var app = express();

/*
 * Definition of global variables.
 */

var kurentoClient = null;
var userRegistry = new UserRegistry();
var pipelines = {};
var candidatesQueue = {};
var idCounter = 0;

var calleeName = '';
var callerName = '';

var of = null;

var follower = null;
var allFollower = null;

var incImg = 1;

var changeSettings = false;

function parseOutput(file, caller, callee)
{
  // console.log('********* parsing output ************' + file);
  if(file.substring(file.length-4, file.length) == '.bmp')
  {
    // console.log("\nBMP\n");

    imageDataURI.encodeFromFile(file).then(res =>
      callee.sendMessage({
        id : 'output',
        imgData : res,
        fileName : file
      }),
    );
  }
}

function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}

/*
 * Definition of helper classes
 */

// Represents caller and callee sessions
function UserSession(id, name, ws) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    this.peer = null;
    this.sdpOffer = null;
}

UserSession.prototype.sendMessage = function(message) {
    this.ws.send(JSON.stringify(message));
}

// Represents registrar of users
function UserRegistry() {
    this.usersById = {};
    this.usersByName = {};
}

UserRegistry.prototype.register = function(user) {
    this.usersById[user.id] = user;
    this.usersByName[user.name] = user;
}

UserRegistry.prototype.unregister = function(id) {
    var user = this.getById(id);
    if (user) delete this.usersById[id]
    if (user && this.getByName(user.name)) delete this.usersByName[user.name];
}

UserRegistry.prototype.getById = function(id) {
    return this.usersById[id];
}

UserRegistry.prototype.getByName = function(name) {
    return this.usersByName[name];
}

UserRegistry.prototype.removeById = function(id) {
    var userSession = this.usersById[id];
    if (!userSession) return;
    delete this.usersById[id];
    delete this.usersByName[userSession.name];
}

// Represents a B2B active call
function CallMediaPipeline() {
    this.pipeline = null;
    this.webRtcEndpoint = {};
}

CallMediaPipeline.prototype.createPipeline = function(callerId, calleeId, ws, callback) {
    var self = this;
    getKurentoClient(function(error, kurentoClient) {
        if (error) {
            return callback(error);
        }

        kurentoClient.create('MediaPipeline', function(error, pipeline) {
            if (error) {
                return callback(error);
            }

            pipeline.create('WebRtcEndpoint', function(error, callerWebRtcEndpoint) {
                if (error) {
                    pipeline.release();
                    return callback(error);
                }

                if (candidatesQueue[callerId]) {
                    while(candidatesQueue[callerId].length) {
                        var candidate = candidatesQueue[callerId].shift();
                        callerWebRtcEndpoint.addIceCandidate(candidate);
                    }
                }

                callerWebRtcEndpoint.on('OnIceCandidate', function(event) {
                    var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                    userRegistry.getById(callerId).ws.send(JSON.stringify({
                        id : 'iceCandidate',
                        candidate : candidate
                    }));
                });

                pipeline.create('WebRtcEndpoint', function(error, calleeWebRtcEndpoint) {
                    if (error) {
                        pipeline.release();
                        return callback(error);
                    }

                    if (candidatesQueue[calleeId]) {
                        while(candidatesQueue[calleeId].length) {
                            var candidate = candidatesQueue[calleeId].shift();
                            calleeWebRtcEndpoint.addIceCandidate(candidate);
                        }
                    }

                    calleeWebRtcEndpoint.on('OnIceCandidate', function(event) {
                        var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                        userRegistry.getById(calleeId).ws.send(JSON.stringify({
                            id : 'iceCandidate',
                            candidate : candidate
                        }));
                    });

                    callerWebRtcEndpoint.connect(calleeWebRtcEndpoint, function(error) {
                        if (error) {
                            pipeline.release();
                            return callback(error);
                        }

                        calleeWebRtcEndpoint.connect(callerWebRtcEndpoint, function(error) {
                            if (error) {
                                pipeline.release();
                                return callback(error);
                            }
                        });

                        self.pipeline = pipeline;
                        self.webRtcEndpoint[callerId] = callerWebRtcEndpoint;
                        self.webRtcEndpoint[calleeId] = calleeWebRtcEndpoint;
						            //var recorder = pipeline.create('RecorderEndpoint', {uri: argv.file_uri});
						            //self.webRtcEndpoint[calleeId].connect(recorder);
                        //console.log("get TAGS");
                        //console.log(self.webRtcEndpoint[calleeId].getTags());
                        console.log("get TAGS");
                        console.log(self.webRtcEndpoint[calleeId].getTags());
						            //recorder.record();
                        callback(null);
                    });
                });
            });
        });
    })
}

CallMediaPipeline.prototype.generateSdpAnswer = function(id, sdpOffer, callback) {
    this.webRtcEndpoint[id].processOffer(sdpOffer, callback);
    this.webRtcEndpoint[id].gatherCandidates(function(error) {
        if (error) {
            return callback(error);
        }
    });
}

CallMediaPipeline.prototype.release = function() {
    if (this.pipeline) this.pipeline.release();
    this.pipeline = null;
}

/*
 * Server startup
 */

var asUrl = url.parse(argv.as_uri);
var port = asUrl.port;
var server = https.createServer(options, app).listen(port, function() {
    console.log('Kurento Tutorial started');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
});

var wss = new ws.Server({
    server : server,
    path : '/one2one'
});

wss.on('connection', function(ws) {
    var sessionId = nextUniqueId();
    console.log('Connection received with sessionId ' + sessionId);

    ws.binaryType = "arraybuffer";

    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
        userRegistry.unregister(sessionId);
    });

    ws.on('message', function(_message) {
        var message = JSON.parse(_message);
        // console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
        case 'register':
            register(sessionId, message.currentUser.name.$t, message.contacts, message.currentUser.email.$t, message.settings, ws);
            break;

        case 'call':
            call(sessionId, message.to, message.from, message.sdpOffer);
            break;

        case 'incomingCallResponse':
            incomingCallResponse(sessionId, message.from, message.callResponse, message.sdpOffer, ws);
            break;

        case 'stop':
            stop(sessionId);
            break;

        case 'onIceCandidate':
            onIceCandidate(sessionId, message.candidate);
            break;

        case 'frame':
            if(getFrame(message)) {
              ws.send(JSON.stringify({
                id : 'frame',
                imgCount : incImg
              }));
              if(incImg == 1)
              {
                of = cp.spawn('./../OpenFace/build/bin/FeatureExtraction', ['-fdir', '/root/OpenFace/samples/image_sequence' , '-of', '../OpenFace/outputs/deneme.txt', '-q']);

                of.stdout.on('data', function(data) {
                  console.log('' + data);
                });

                of.on('close', function(code, signal) {
                  console.log('ls finished...');
                });
              }
              incImg++;
            }
            break;

        case 'getSettings':
          getSettings(message.email, ws);
          break;

        case 'applySettings':
          applySettings(message.user, message.contacts, message.settings, ws);
          break;

        case 'setSettings':
          setSettings(message.user, message.contacts, message.settings, ws);
          break;

        case 'speechToNum':
          ws.send(JSON.stringify({
            id: 'speechToNum',
            num: w2n.parse(message.txt)[0]
          }));
          console.log(w2n.parse(message.txt));
          break;

        default:
            ws.send(JSON.stringify({
                id : 'error',
                message : message
            }));
            break;
        }
    });
});

function writeSettingsInput(settings) {
  try {
    fs.appendFileSync('../OpenFace/inputFile.txt', '$fear_sensivity ' +  settings.emotion_fear_sensivity + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$disgust_sensivity ' +  settings.emotion_disgust_sensivity + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$happiness_sensivity ' +  settings.emotion_happiness_sensivity + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$sadness_sensivity ' +  settings.emotion_sadness_sensivity + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$surprised_sensivity ' +  settings.emotion_surprised_sensivity + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$anger_sensivity ' +  settings.emotion_anger_sensivity + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$gaze_sensivity ' +  settings.gaze_sensivity + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$fear ' +  settings.emotion_fear + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$disgust ' +  settings.emotion_disgust + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$happiness ' +  settings.emotion_happiness + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$sadness ' +  settings.emotion_sadness + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$surprised ' +  settings.emotion_surprised + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$anger ' +  settings.emotion_anger + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$neutral ' +  settings.emotion_neutral + '\n');
    fs.appendFileSync('../OpenFace/inputFile.txt', '$gaze ' +  settings.gaze + '\n');
  } catch (err) {
    /* Handle the error */
    console.log('error writing inputFile: ' + err);
  }
}

function applySettings(currentUser, contacts, newSettings, ws) {


  mongoose.connect('mongodb://eyecontact:123abcd1@ds239029.mlab.com:39029/eyecontact');

  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'connection error:'));

  let set = null;

  db.once('open', function() {
    var newUser = new User({
      name: currentUser.name.$t,
      email: currentUser.email.$t,
      contacts: contacts,
      settings: newSettings
    });

    var editUser = {};
    editUser = Object.assign(editUser, newUser._doc);
    delete editUser._id;

    User.findOneAndUpdate({email: newUser.email}, editUser, {upsert: true}, function(error, result) {
      if(error) {
          console.log(error);
      }
    });

  });

  writeSettingsInput(newSettings);
}

function setSettings(currentUser, contacts, newSettings, ws) {

  mongoose.connect('mongodb://eyecontact:123abcd1@ds239029.mlab.com:39029/eyecontact');

  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'connection error:'));

  let set = null;

  db.once('open', function() {
    var newUser = new User({
      name: currentUser.name.$t,
      email: currentUser.email.$t,
      contacts: contacts,
      settings: newSettings
    });

    console.log(newSettings);

    var editUser = {};
    editUser = Object.assign(editUser, newUser._doc);
    delete editUser._id;

    User.findOneAndUpdate({email: newUser.email}, editUser, {upsert: true}, function(error, result) {
      if(error) {
          console.log(error);
      }
      // console.log(result.settings);
    });

  });
}

function getSettings(email, ws)
{

  mongoose.connect('mongodb://eyecontact:123abcd1@ds239029.mlab.com:39029/eyecontact');

  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'connection error:'));

  let set = null;

  db.once('open', function() {
    User.findOne({email: email}, function(err, user) {
      if(err) {
        console.log(err);
        return false;
      }
      if(user.settings) {
        ws.send(JSON.stringify({
          id: 'getSettings',
          settings: user.settings
        }));

        console.log(user.settings);

        writeSettingsInput(user.settings);

        return true;
      }
      else {
        ws.send(JSON.stringify({
          id: 'getSettings',
          settings: 'default'
        }));
        return false;
      }
    });
  });
}

function getFrame(frame)
{
  // console.log(frame.path);

  //var buff = Buffer.from(frame.buf.buf);
  // var blob = new Blob([ frame.buf.buf ], { type: frame.buf.type });
  // blobUtil.arrayBufferToBlob(frame.buf.buf, frame.buf.type).then(function (blob) {
  //   console.log("yeah");
  //   // blobb = blob;
  //   // console.log(blob);
  //   }).catch(function (err) {
  // // error
  // });

  let dataURI = frame.buf.dataUri;

  // It will create the full path in case it doesn't exist
  // If the extension is defined (e.g. fileName.png), it will be preserved, otherwise the lib will try to guess from the Data URI
  let filePath = '/root/OpenFace/samples/image_sequence/' + incImg + '.jpg';


  // Returns a Promise
  imageDataURI.outputFile(dataURI, filePath)
  // .then(res =>
  //   console.log(res)
  //   //shell.exec('./../OpenFace/build/bin/FeatureExtraction -fdir ./frames/callee -of ../OpenFace/output' + res + '.txt -q')
  // );

  return true;
}

// Recover kurentoClient for the first time.
function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    kurento(argv.ws_uri, function(error, _kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + argv.ws_uri;
            return callback(message + ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function stop(sessionId) {
    if (!pipelines[sessionId]) {
        return;
    }

    // fse.removeSync('/root/OpenFace/samples/image_sequence', err => {
    //   if (err) return console.error(err)
    //
    //   console.log('clean frames')
    // });
    //
    // fse.removeSync('/root/OpenFace/outputs/*', err => {
    //   if (err) return console.error(err)
    //
    //   console.log('clean outputs/')
    // });

    var pipeline = pipelines[sessionId];
    delete pipelines[sessionId];
    pipeline.release();
    var stopperUser = userRegistry.getById(sessionId);
    var stoppedUser = userRegistry.getByName(stopperUser.peer);
    stopperUser.peer = null;

    if (stoppedUser) {
        stoppedUser.peer = null;
        delete pipelines[stoppedUser.id];
        var message = {
            id: 'stopCommunication',
            message: 'remote user hanged out'
        };
        stoppedUser.sendMessage(message);
    }

    clearCandidatesQueue(sessionId);

    if(shell.exec('rm -rf /root/OpenFace/samples/image_sequence/*'))
      console.log('clean frames');
    if(shell.exec('rm -rf /root/OpenFace/outputs/*'))
      console.log('clean outputs');

    shell.exec('mkdir /root/OpenFace/outputs/deneme_alligned');

    if(shell.exec('> ../OpenFace/outputFile.txt'))
      console.log("outputFile cleared");

    if(shell.exec('> /root/OpenFace/emotionsOutputFile.txt'))
      console.log("emotionsOutputFile cleared");

      if(of) {
          of.kill('SIGHUP');
      }

      follower.close();
      allFollower.close();

      follower = null;
      allFollower.close();

      of = null;

      incImg = 1;

}

function incomingCallResponse(calleeId, from, callResponse, calleeSdp, ws) {

    clearCandidatesQueue(calleeId);

    function onError(callerReason, calleeReason) {
        if (pipeline) pipeline.release();
        if (caller) {
            var callerMessage = {
                id: 'callResponse',
                response: 'rejected'
            }
            if (callerReason) callerMessage.message = callerReason;
            caller.sendMessage(callerMessage);
        }

        var calleeMessage = {
            id: 'stopCommunication'
        };
        if (calleeReason) calleeMessage.message = calleeReason;
        callee.sendMessage(calleeMessage);
    }

    var callee = userRegistry.getById(calleeId);
    if (!from || !userRegistry.getByName(from)) {
        return onError(null, 'unknown from = ' + from);
    }
    var caller = userRegistry.getByName(from);

    if (callResponse === 'accept') {
        var pipeline = new CallMediaPipeline();
        pipelines[caller.id] = pipeline;
        pipelines[callee.id] = pipeline;

        pipeline.createPipeline(caller.id, callee.id, ws, function(error) {
            if (error) {
                return onError(error, error);
            }

            pipeline.generateSdpAnswer(caller.id, caller.sdpOffer, function(error, callerSdpAnswer) {
                if (error) {
                    return onError(error, error);
                }

                pipeline.generateSdpAnswer(callee.id, calleeSdp, function(error, calleeSdpAnswer) {
                    if (error) {
                        return onError(error, error);
                    }

                    var message = {
                        id: 'startCommunication',
                        sdpAnswer: calleeSdpAnswer,
                        callee: callee.name,
                        caller: from,
                    };
                    calleeName = callee.name;
                    callerName = from;

                    callee.sendMessage(message);

                    message = {
                        id: 'callResponse',
                        response : 'accepted',
                        sdpAnswer: callerSdpAnswer,
                        callee: callee.name,
                        caller: from
                    };
                    caller.sendMessage(message);
                });
            });
        });
    } else {
        var decline = {
            id: 'callResponse',
            response: 'rejected',
            message: 'user declined'
        };
        caller.sendMessage(decline);
    }

    // var watcher = fswatch.watch('/root/OpenFace/outputs', {
    //   ignored: /(^|[\/\\])\../,
    //   persistent: true
    // });
    //
    // var log = console.log.bind(console);
    //
    // watcher
    //   .on('add', path => parseOutput(path, caller, callee))
    //   .on('change', path => parseOutput(path, caller, callee))
    //   .on('unlink', path => log(`File ${path} has been removed`))
    //   .on('addDir', path => watcher.add(path, caller, callee));

    follower = follow('/root/OpenFace/outputFile.txt', options = {persistent: true, catchup: true});

    follower.on('line', function(filename, line) {
      // console.log('OpenFace: '+line);
      if(line.includes('$modelLoaded'))
      {
        // console.log('----------------');
        caller.sendMessage({
          id: 'capture'
        });

        allFollower = follow('/root/OpenFace/emotionsOutputFile.txt', options = {persistent: true, catchup: true});

        allFollower.on('line', function(filename, line) {
          // console.log('OpenFace: '+line);
          if(line.includes('$'))
          {
            if(line.includes('anger')) {
              caller.sendMessage({
                id: 'tracking',
                emotion: 'anger',
                data: line.substr(line.indexOf(':')+1)
              });
            }
            if(line.includes('disgust')) {
              caller.sendMessage({
                id: 'tracking',
                emotion: 'disgust',
                data: line.substr(line.indexOf(':')+1)
              });
            }
            if(line.includes('fear')) {
              caller.sendMessage({
                id: 'tracking',
                emotion: 'fear',
                data: line.substr(line.indexOf(':')+1)
              });
            }
            if(line.includes('happiness')) {
              caller.sendMessage({
                id: 'tracking',
                emotion: 'happiness',
                data: line.substr(line.indexOf(':')+1)
              });
            }
            if(line.includes('sadness')) {
              caller.sendMessage({
                id: 'tracking',
                emotion: 'sadness',
                data: line.substr(line.indexOf(':')+1)
              });
            }
            if(line.includes('surprise')) {
              caller.sendMessage({
                id: 'tracking',
                emotion: 'surprised',
                data: line.substr(line.indexOf(':')+1)
              });
            }
            if(line.includes('neutral')) {
              caller.sendMessage({
                id: 'tracking',
                emotion: 'neutral',
                data: line.substr(line.indexOf(':')+1)
              });
            }
          }
          else {
            caller.sendMessage({
              id: 'tracking',
              emotion: 'n/a',
              data: 0
            });
          }
        });

      }
      else {
        caller.sendMessage({
          id: 'openFace',
          data: line
        });
      }
    });
}

function call(callerId, to, from, sdpOffer) {
    clearCandidatesQueue(callerId);

    var caller = userRegistry.getById(callerId);
    var rejectCause = 'User ' + to + ' is offline';
    if (userRegistry.getByName(to)) {
        var callee = userRegistry.getByName(to);
        caller.sdpOffer = sdpOffer
        callee.peer = from;
        caller.peer = to;
        var message = {
            id: 'incomingCall',
            from: from
        };
        try{
            return callee.sendMessage(message);
        } catch(exception) {
            rejectCause = "Error " + exception;
        }
    }
    var message  = {
        id: 'callResponse',
        response: 'rejected: ',
        message: rejectCause
    };
    caller.sendMessage(message);


}

function register(id, userName, contacts, email, settings, ws, callback) {
    function onError(error) {
        ws.send(JSON.stringify({id:'registerResponse', response : 'rejected ', message: error}));
    }

    if (!email) {
        return onError("empty user name");
    }

    if (userRegistry.getByName(email)) {
        return onError("User " + userName + " is already registered");
    }

    mongoose.connect('mongodb://eyecontact:123abcd1@ds239029.mlab.com:39029/eyecontact');

    var db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));

    db.once('open', function() {
      // we're connected!

      var newUser = new User({
        name: userName,
        email: email,
        contacts: contacts,
        settings: settings
      });

      var editUser = {};
      editUser = Object.assign(editUser, newUser._doc);
      delete editUser._id;

      // newUser.save(function (err, newUser) {
      //   if (err) {
      //     if(err.code == 11000) {
      //       console.log('User ' + userName + ' already exists.');
      //       changeSettings = true;
      //       console.log(changeSettings);
      //       if(changeSettings) {
      //         let editUser = new User({
      //           name: userName,
      //           email: email,
      //           contacts: contacts,
      //           settings: settings
      //         });
      //         User.findOneAndUpdate({email: editUser.email}, editUser, {new: false, upsert: false}, function(error, result) {
      //           if(error){
      //             console.log("Something wrong when updating data!");
      //             console.log(err);
      //           }
      //
      //           console.log(result);
      //
      //           changeSettings = false;
      //         });
      //       }
      //     }
      //   }
      //   else {
      //     console.log(userName + ' added to db');
      //   }
      // });

      User.findOneAndUpdate({email: newUser.email}, editUser, {upsert: true}, function(error, result) {
        if(error) {
          if(error.code == 11000) {
            console.log("User" + newUser.name + "already exists.");
            // getSettings(newUser.email, ws);
          }
          else {
            console.log(error);
          }
        }
      });

    userRegistry.register(new UserSession(id, email, ws));

    try {
      ws.send(JSON.stringify({id: 'registerResponse', response: 'accepted'}));
    } catch(exception) {
        onError(exception);
    }
  });
}

function clearCandidatesQueue(sessionId) {
    if (candidatesQueue[sessionId]) {
        delete candidatesQueue[sessionId];
    }
}

function onIceCandidate(sessionId, _candidate) {
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);
    var user = userRegistry.getById(sessionId);

    if (pipelines[user.id] && pipelines[user.id].webRtcEndpoint && pipelines[user.id].webRtcEndpoint[user.id]) {
        var webRtcEndpoint = pipelines[user.id].webRtcEndpoint[user.id];
        webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
        if (!candidatesQueue[user.id]) {
            candidatesQueue[user.id] = [];
        }
        candidatesQueue[sessionId].push(candidate);
    }
}

app.use(express.static(path.join(__dirname, 'static')));
