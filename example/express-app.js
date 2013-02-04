var express = require('express');
var MjpegProxy = require('../mjpeg-proxy').MjpegProxy;

var cam1 = "http://admin:admin@192.168.124.54/cgi/mjpg/mjpg.cgi";
var cam2 = "http://admin:@192.168.124.32/videostream.cgi";

var app = express();

app.set("view options", {layout: false});
app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res) {
  res.render('index.html');
});

app.get('/index1.jpg', new MjpegProxy(cam1).proxyRequest);
app.get('/index2.jpg', new MjpegProxy(cam2).proxyRequest);

app.listen(8080)