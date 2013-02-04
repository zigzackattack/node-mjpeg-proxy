var url = require('url');
var http = require('http');

require('buffertools');

function extractBoundary(contentType) {
  var startIndex = contentType.indexOf('boundary=');
  var endIndex = contentType.indexOf(';', startIndex);
  if (endIndex == -1) { //boundary is the last option
    // some servers, like mjpeg-streamer puts a '\r' character at the end of each line.
    if ((endIndex = contentType.indexOf('\r', startIndex)) == -1) {
      endIndex = contentType.length;
    }
  }
  return contentType.substring(startIndex + 9, endIndex);
}

var MjpegProxy = exports.MjpegProxy = function(mjpegUrl) {
  var self = this;

  if (!mjpegUrl) throw new Error('Please provide a source MJPEG URL');

  self.mjpegOptions = url.parse(mjpegUrl);

  self.audienceResponses = [];
  self.newAudienceResponses = [];

  self.boundary = null;
  self.globalMjpegResponse = null;

  self.proxyRequest = function(req, res) {

    // There is already another client consuming the MJPEG response
    if (self.audienceResponses.length > 0) {
      self._newClient(req, res);
    } else {
      // Send source MJPEG request
      var mjpegRequest = http.request(self.mjpegOptions, function(mjpegResponse) {
        self.globalMjpegResponse = mjpegResponse;
        self.boundary = extractBoundary(mjpegResponse.headers['content-type']);

        self._newClient(req, res);

        var lastByte1 = null;
        var lastByte2 = null;

        mjpegResponse.on('data', function(chunk) {
          // Fix CRLF issue on iOS 6+: boundary should be preceded by CRLF.
          if (lastByte1 != null && lastByte2 != null) {
            var oldheader = '--' + self.boundary;
            var p = chunk.indexOf(oldheader); // indexOf provided by buffertools

            if (p == 0 && !(lastByte2 == 0x0d && lastByte1 == 0x0a) || p > 1 && !(chunk[p - 2] == 0x0d && chunk[p - 1] == 0x0a)) {
              var b1 = chunk.slice(0, p);
              var b2 = new Buffer('\r\n--' + self.boundary);
              var b3 = chunk.slice(p + oldheader.length);
              chunk = Buffer.concat([b1, b2, b3]);
            }
          }

          lastByte1 = chunk[chunk.length - 1];
          lastByte2 = chunk[chunk.length - 2];

          for (var i = self.audienceResponses.length; i--;) {
            var res = self.audienceResponses[i];

            // First time we push data... lets start at a boundary
            if (self.newAudienceResponses.indexOf(res) >= 0) {
              var p = chunk.indexOf('--' + self.boundary); // indexOf provided by buffertools
              res.write(chunk.slice(p));

              self.newAudienceResponses.splice(self.newAudienceResponses.indexOf(res), 1); // remove from new
            } else {
              res.write(chunk);
            }
          }
        });
        mjpegResponse.on('end', function () {
          // console.log("...end");
          for (var i = self.audienceResponses.length; i--;) {
            var res = self.audienceResponses[i];
            res.end();
          }
        });
        mjpegResponse.on('close', function () {
          // console.log("...close");
        });
      });

      mjpegRequest.on('error', function(e) {
        console.log('problem with request: ', e);
      });
      mjpegRequest.end();
    }
  }

  self._newClient = function(req, res) {
    res.writeHead(200, {
      'Expires': 'Mon, 01 Jul 1980 00:00:00 GMT',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Content-Type': 'multipart/x-mixed-replace;boundary=' + self.boundary
    });

    self.audienceResponses.push(res);
    self.newAudienceResponses.push(res);

    res.socket.on('close', function () {
      // console.log('exiting client!');

      self.audienceResponses.splice(self.audienceResponses.indexOf(res), 1);
      if (self.newAudienceResponses.indexOf(res) >= 0) {
        self.newAudienceResponses.splice(self.newAudienceResponses.indexOf(res), 1); // remove from new
      }

      if (self.audienceResponses.length == 0) {
        self.globalMjpegResponse.destroy();
      }
    });
  }
}