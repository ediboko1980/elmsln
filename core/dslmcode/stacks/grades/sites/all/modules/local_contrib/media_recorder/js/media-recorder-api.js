/**
 * @file
 * Adds an interface between the media recorder jQuery plugin and the drupal media module.
 */

(function($) {
  'use strict';

  Drupal.behaviors.mediaRecorder = {
    attach: function(context, settings) {
      $('.field-widget-media-recorder').once().each(function (key, element) {

        // Hide all file field related elements.
        $(element).find('span.file, span.file-size, .media-recorder-upload, .media-recorder-upload-button, .media-recorder-remove-button').hide();

        // Declare DOM elements.
        var $element = $(element);
        var $audioConstraintButton = $element.find('.media-recorder-enable-audio');
        var $videoConstraintButton = $element.find('.media-recorder-enable-video');
        var $previewWrapper = $element.find('.media-recorder-preview');
        var $statusWrapper = $element.find('.media-recorder-status');
        var $controlsWrapper = $element.find('.media-recorder-controls');
        var $recordButton = $element.find('.media-recorder-record');
        var $stopButton = $element.find('.media-recorder-stop');

        // Click handler for enable audio button.
        $audioConstraintButton.bind('click', function (event) {
          event.preventDefault();
          $audioConstraintButton.addClass('active');
          $videoConstraintButton.removeClass('active');
          startStream({
            audio: true,
            video: false
          });
        });

        // Click handler for enable video button.
        $videoConstraintButton.bind('click', function (event) {
          event.preventDefault();
          $audioConstraintButton.removeClass('active');
          $videoConstraintButton.addClass('active');
          startStream({
            audio: true,
            video: true
          });
        });

        // Click handler for record button.
        $recordButton.bind('click', function (event) {
          event.preventDefault();
          Drupal.mediaRecorder.record();
        });

        // Click handler for stop button.
        $stopButton.bind('click', function (event) {
          event.preventDefault();
          Drupal.mediaRecorder.stop();
        });

        // Listen for the record event.
        $(Drupal.mediaRecorder).bind('recordStart', function (event, data) {
          var currentSeconds = 0;
          var timeLimit = millisecondsToTime(new Date(parseInt(Drupal.mediaRecorder.settings.time_limit, 10) * 1000));

          $recordButton.hide();
          $stopButton.show();
          $(Drupal.mediaRecorder).trigger('status', 'Recording 00:00 (Time Limit: ' + timeLimit + ')');

          function millisecondsToTime(milliSeconds) {
            var milliSecondsDate = new Date(milliSeconds);
            var mm = milliSecondsDate.getMinutes();
            var ss = milliSecondsDate.getSeconds();
            if (mm < 10) {
              mm = "0" + mm;
            }
            if (ss < 10) {
              ss = "0" + ss;
            }
            return mm + ':' + ss;
          }

          Drupal.mediaRecorder.statusInterval = setInterval(function () {
            currentSeconds = currentSeconds + 1;
            var currentMilliSeconds = new Date(currentSeconds * 1000);
            var time = millisecondsToTime(currentMilliSeconds);
            $(Drupal.mediaRecorder).trigger('status', 'Recording ' + time + ' (Time Limit: ' + timeLimit + ')');

            if (currentSeconds >= Drupal.mediaRecorder.settings.time_limit) {
              Drupal.mediaRecorder.stop();
            }
          }, 1000);
        });

        // Listen for the stop event.
        $(Drupal.mediaRecorder).bind('recordStop', function (event) {
          $stopButton.hide();
          clearInterval(Drupal.mediaRecorder.statusInterval);
          $(Drupal.mediaRecorder).trigger('status', 'Processing file...');
        });

        // Append file object data.
        $(Drupal.mediaRecorder).bind('refreshData', function (event, data) {
          $element.find('.media-recorder-fid').val(data.fid);
          $element.find('.media-recorder-refresh').trigger('mousedown');
          $recordButton[0].disabled = false;
          $(Drupal.mediaRecorder).trigger('status', 'Press record to start recording.');
          $recordButton.show();
        });

        $(Drupal.mediaRecorder).bind('status', function (event, msg) {
          $statusWrapper.text(msg);
        });

        // Initial state.
        $previewWrapper.hide();
        $controlsWrapper.hide();
        $(Drupal.mediaRecorder).trigger('status', 'Select audio or video to begin recording.');

        /**
         * Start user media stream.
         */
        function startStream (constraints) {
          if (Drupal.mediaRecorder.stream) {
            stopStream();
          }
          navigator.getUserMedia(
            constraints,
            function(stream) {
              Drupal.mediaRecorder.stream = stream;
              Drupal.mediaRecorder.recorder = new MediaRecorder(Drupal.mediaRecorder.stream);
              Drupal.mediaRecorder.format = constraints.video ? 'webm' : 'ogg';
              Drupal.mediaRecorder.mimetype = constraints.video ? 'video/webm' : 'audio/ogg';
              Drupal.mediaRecorder.audioContext = new AudioContext();
              Drupal.mediaRecorder.analyser = Drupal.mediaRecorder.audioContext.createAnalyser();
              Drupal.mediaRecorder.microphone = Drupal.mediaRecorder.audioContext.createMediaStreamSource(stream);
              Drupal.mediaRecorder.analyser.smoothingTimeConstant = 0.75;
              Drupal.mediaRecorder.analyser.fftSize = 512;

              $previewWrapper.show();
              $controlsWrapper.show();
              $stopButton.hide();

              $(Drupal.mediaRecorder).trigger('status', 'Press record to start recording.');

              if (constraints.video) {
                var video = $('<video autoplay muted src="' + URL.createObjectURL(Drupal.mediaRecorder.stream) + '"></video>');
                video[0].muted = 'muted'; // Firefox isn't muting as expected.
                var volumeMeter = $(createVolumeMeter());
                video.appendTo($previewWrapper).height($previewWrapper.height());
                volumeMeter.appendTo($previewWrapper).height($previewWrapper.height());
                video[0].play();
                $previewWrapper.addClass('video').removeClass('audio');
              } else {
                var audioVisualizer = $(createAudioVisualizer());
                audioVisualizer.appendTo($previewWrapper).height($previewWrapper.height());
                $previewWrapper.addClass('audio').removeClass('video');
              }
            },
            function(error) {
              alert("There was a problem accessing your camera or mic. Please click 'Allow' at the top of the page.");
            }
          );
        }

        /**
         * Stop user media stream.
         */
        function stopStream () {
          Drupal.mediaRecorder.analyser.disconnect();
          Drupal.mediaRecorder.microphone.disconnect();
          Drupal.mediaRecorder.stream.stop();
          $previewWrapper.text('');
          $previewWrapper.hide();
        }

        /**
         * Create volume meter canvas element that uses getUserMedia stream.
         */
        function createVolumeMeter () {
          var canvas = document.createElement('canvas');
          var canvasContext = canvas.getContext("2d");

          Drupal.mediaRecorder.meterProcessor = Drupal.mediaRecorder.audioContext.createScriptProcessor(2048, 1, 1);
          Drupal.mediaRecorder.microphone.connect(Drupal.mediaRecorder.analyser);
          Drupal.mediaRecorder.analyser.connect(Drupal.mediaRecorder.meterProcessor);
          Drupal.mediaRecorder.meterProcessor.connect(Drupal.mediaRecorder.audioContext.destination);

          Drupal.mediaRecorder.meterProcessor.onaudioprocess = function() {
            var freqData = new Uint8Array(Drupal.mediaRecorder.analyser.frequencyBinCount);
            Drupal.mediaRecorder.analyser.getByteFrequencyData(freqData);
            var level = Math.max.apply(Math, freqData);
            canvasContext.clearRect(0, 0, canvas.width, canvas.clientHeight);
            canvasContext.fillStyle = '#00ff00';
            canvasContext.fillRect(0, canvas.height - (canvas.height * (level / 255)), canvas.width, canvas.height * (level / 255));
          };

          canvas.className = 'media-recorder-meter';

          return canvas;
        }

        /**
         * Create audio visualizer canvas element that uses getUserMedia stream.
         */
        function createAudioVisualizer () {
          var canvas = document.createElement('canvas');
          var canvasContext = canvas.getContext("2d");
          var micStatus = false;

          if (!Drupal.mediaRecorder.audioContext || !Drupal.mediaRecorder.microphone || !Drupal.mediaRecorder.analyser) {
            var textWidth, textString = 'Audio visualizer unable to initialize';

            canvasContext.font = 'bold 1em Arial';
            canvasContext.fillStyle = '#ffffff';
            textWidth = canvasContext.measureText(textString).width;
            canvasContext.fillText(textString, (canvas.width / 2) - (textWidth / 2), canvas.height / 2);

            return canvas;
          }

          Drupal.mediaRecorder.visualizerProcessor = Drupal.mediaRecorder.audioContext.createScriptProcessor(2048, 1, 1);
          Drupal.mediaRecorder.microphone.connect(Drupal.mediaRecorder.analyser);
          Drupal.mediaRecorder.analyser.connect(Drupal.mediaRecorder.visualizerProcessor);
          Drupal.mediaRecorder.visualizerProcessor.connect(Drupal.mediaRecorder.audioContext.destination);

          Drupal.mediaRecorder.visualizerProcessor.onaudioprocess = function() {
            var freqData = new Uint8Array(Drupal.mediaRecorder.analyser.frequencyBinCount);
            Drupal.mediaRecorder.analyser.getByteFrequencyData(freqData);
            var volume = getVolume();

            if (volume === 0) {
              micStatus = false;
              $(Drupal.mediaRecorder).trigger('status', 'Your mic has a problem. Check your browser or computer audio settings.');
            } else if (volume && !micStatus) {
              micStatus = true;
              $(Drupal.mediaRecorder).trigger('status', 'Press record to start recording.');
            }

            var barWidth = Math.ceil(canvas.width / (Drupal.mediaRecorder.analyser.frequencyBinCount * 0.5));
            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
            for (var i = 0; i < Drupal.mediaRecorder.analyser.frequencyBinCount; i++) {
              canvasContext.fillStyle = 'hsl(' + i / Drupal.mediaRecorder.analyser.frequencyBinCount * 360 + ', 100%, 50%)';
              if ((barWidth * i) + barWidth < canvas.width) {
                canvasContext.fillRect(barWidth * i, canvas.height, barWidth - 1, -(Math.floor((freqData[i] / 255) * canvas.height) + 1));
              }
            }

            // Private function for determining current volume.
            function getVolume() {
              var values = 0;
              var length = freqData.length;
              for (var i = 0; i < length; i++) {
                values += freqData[i];
              }
              return values / length;
            }
          };

          canvas.className = 'media-recorder-visualizer';

          return canvas;
        }
      });

      /**
       * Start recording and trigger recording event.
       */
      Drupal.mediaRecorder.record = function () {
        Drupal.mediaRecorder.blobs = [];
        Drupal.mediaRecorder.blobCount = 0;

        // Triggered on data available.
        Drupal.mediaRecorder.recorder.ondataavailable = function (e) {
          var blob = new Blob([e.data], { type: e.data.type || Drupal.mediaRecorder.mimetype });
          if (blob.size > 0) {
            Drupal.mediaRecorder.blobCount++;
            Drupal.mediaRecorder.sendBlob(blob, Drupal.mediaRecorder.blobCount);
          }
        };

        // Triggered when recording is stopped. Requires ajax 1.5+.
        Drupal.mediaRecorder.recorder.onstop = function (e) {
          $(document).ajaxStop(function () {
            $(this).unbind("ajaxStop");
            $.ajax({
              url: Drupal.mediaRecorder.origin + Drupal.settings.basePath + 'media_recorder/record/stream/finish',
              type: 'POST',
              async: true,
              data: {
                count: Drupal.mediaRecorder.blobs.length
              },
              success: function (data) {
                $(Drupal.mediaRecorder).trigger('refreshData', data);
              },
              error: function (data) {
                alert('There was an issue saving your recording, please try again.');
              }
            });
          });
        };

        // Notify server that recording has started. Start recording if server is available.
        $.ajax({
          url: Drupal.mediaRecorder.origin + Drupal.settings.basePath + 'media_recorder/record/stream/start',
          type: 'POST',
          data: {
            format: Drupal.mediaRecorder.format
          },
          async: false,
          success: function (data) {
            Drupal.mediaRecorder.recorder.start(1000);
            $(Drupal.mediaRecorder).trigger('recordStart');
          }
        });
      };

      /**
       * Stop recording and trigger stopped event.
       */
      Drupal.mediaRecorder.stop = function () {
        Drupal.mediaRecorder.recorder.stop();
        $(Drupal.mediaRecorder).trigger('recordStop');
      };

      /**
       * Send a blob as form data to the server. Requires jQuery 1.5+.
       */
      Drupal.mediaRecorder.sendBlob = function (blob, count) {

        // Create formData object.
        var formData = new FormData();
        formData.append("blob", blob);
        formData.append("count", count);

        // Return ajax promise.
        $.ajax({
          url: Drupal.mediaRecorder.origin + Drupal.settings.basePath + 'media_recorder/record/stream/record',
          type: 'POST',
          data: formData,
          processData: false,
          contentType: false,
          success: function (data) {
            Drupal.mediaRecorder.blobs.push(data);
          },
          error: function (jqXHR, textStatus, errorThrown) {
            console.log(jqXHR, textStatus, errorThrown);
          }
        });
      }
    }
  };
})(jQuery);
