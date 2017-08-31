'use strict';

/**
 * Ensure that all environment variables are configured.
 */

var dotenv = require('dotenv');
dotenv.config();

[
  'DOMAIN',
  'LOGS_PATH',
  'PORT'
].forEach(varName => {
  if (!process.env.hasOwnProperty(varName)) {
    throw new Error('Missing environment variable: ' + varName);
  }
});

/**
 * Module dependencies.
 */

var spawn = require('child_process').spawn;
var fs = require('fs');
var http = require('http');
var path = require('path');

var express = require('express');
var helmet = require('helmet');

/**
 * Initialize express server.
 */

var app = express();
app.use(helmet());

app.use(function(req, res, next) {
  // Set Content-Type to text/plain
  res.type('.txt');
  next();
});

app.get('/streams/:app_id/:build_id', function(req, res, next) {
  if (! req.params.build_id.endsWith('.log')) {
    return res.status(404).send('404 Not Found');
  }
  req.params.build_id = req.params.build_id.substring(0, req.params.build_id.length - 4);
  var V4_UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;
  if (! V4_UUID.test(req.params.app_id) || ! V4_UUID.test(req.params.build_id)) {
    return res.status(404).send('404 Not Found');
  }

  var dir = path.join(
    process.env.LOGS_PATH,
    req.params.app_id,
    `${req.params.build_id}.log`
  );

  var tmp = path.join(
    process.env.LOGS_PATH,
    req.params.app_id,
    `${req.params.build_id}.tmp`
  );

  // Check if log exists
  if (!fs.existsSync(dir)) {
    console.log('no');
    return res.status(404).send('404 Not Found');
  }

  // If build is done, send everything
  if (fs.existsSync(tmp)) {
    return res.sendFile(dir);
  }

  var ps = spawn('tail', ['-f', '-n', '+1', dir]);
  var lastReceiveTime = new Date().getTime();

  ps.stdout.on('data', function(data) {
    lastReceiveTime = new Date().getTime();
    res.write(data);
  });

  var timerId = setInterval(function() {
    if (lastReceiveTime + 10000 < new Date() || fs.existsSync(tmp)) {
      // Check if ${req.params.build_id}.tmp exists
      // TODO: remove .tmp at end of build once database implementation is ready
      clearInterval(timerId);
      ps.kill();
      return res.end(); // Stop the streaming
    }
  }, 1000);

  req.on('close', function() {
    clearInterval(timerId);
    ps.kill();
  });
});

/**
 * 404 handler.
 */

app.use(function(req, res, next) {
  var err = new Error();
  err.status = 404;
  next(err);
});

/**
 * Error handler.
 */

app.use(function(err, req, res, next) {
  err.status = err.status || 500;
  console.log(err);
  res.status(err.status).send(err.status + ' ' + http.STATUS_CODES[err.status]);
});

/**
 * Listen on provided port, on all network interfaces.
 */

var PORT = process.env.PORT || 9002;
app.listen(PORT, function(error) {
  error
  ? console.error(error)
  : console.log(`-----> Build Output Server listening on port ${PORT}`);
});
