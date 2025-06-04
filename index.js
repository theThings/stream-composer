var stream = require('stream'); // En lugar de "streamx"
var EventEmitter = require('events').EventEmitter;
var util = require('util');

// Constructor para la clase Composer
function Composer(opts) {
  stream.Duplex.call(this, opts);
  
  this._writable = null;
  this._readable = null;
  this._isPipeline = false;
  this._pipelineMissing = 2;
  this._writeCallback = null;
  this._finalCallback = null;

  this._ondata = this._pushData.bind(this);
  this._onend = this._pushEnd.bind(this, null);
  this._ondrain = this._continueWrite.bind(this, null);
  this._onfinish = this._maybeFinal.bind(this);
  this._onerror = this.destroy.bind(this);
  this._onclose = this.destroy.bind(this, null);
}

util.inherits(Composer, stream.Duplex); // Habilitar la herencia de Duplex

// Métodos estáticos
Composer.pipeline = function() {
  var c = new Composer();
  c.setPipeline.apply(c, arguments);
  return c;
};

Composer.duplexer = function(ws, rs) {
  var c = new Composer();
  c.setWritable(ws || null);
  c.setReadable(rs || null);
  return c;
};

// Definir métodos en el prototipo de Composer
Composer.prototype.setPipeline = function(first) {
  var streams = Array.isArray(first) ? first : Array.prototype.slice.call(arguments);
  this._isPipeline = true;

  this.setWritable(streams[0]);
  this.setReadable(streams[streams.length - 1]);

  var self = this;
  try {
    streams.reduce(function(prev, next) {
      return prev.pipe(next);
    });
  } catch (err) {
    self.destroy(err);
  }

  return this;
};

Composer.prototype.setReadable = function(rs) {
  if (this._readable) {
    this._readable.removeListener('data', this._ondata);
    this._readable.removeListener('end', this._onend);
    this._readable.removeListener('error', this._onerror);
    this._readable.removeListener('close', this._onclose);
  }

  if (rs === null) {
    this._readable = null;
    this.push(null);
    this.resume();
    return this;
  }

  this._readable = rs;
  this._readable.on('data', this._ondata);
  this._readable.on('end', this._onend);
  this._readable.on('error', this._onerror);
  this._readable.on('close', this._onclose);

  return this;
};

Composer.prototype.setWritable = function(ws) {
  if (this._writable) {
    this._writable.removeListener('drain', this._ondrain);
    this._writable.removeListener('finish', this._onfinish);
    this._writable.removeListener('error', this._onerror);
    this._writable.removeListener('close', this._onclose);
  }

  if (ws === null) {
    this._writable = null;
    this._continueWrite(null);
    this.end();
    return this;
  }

  this._writable = ws;
  this._writable.on('drain', this._ondrain);
  this._writable.on('finish', this._onfinish);
  this._writable.on('error', this._onerror);
  this._writable.on('close', this._onclose);

  return this;
};

Composer.prototype._read = function(cb) {
  if (this._readable !== null) {
    this._readable.resume();
  }
  cb(null);
};

Composer.prototype._pushData = function(data) {
  if (this.push(data) === false && this._readable !== null) {
    this._readable.pause();
  }
};

Composer.prototype._pushEnd = function() {
  if (this._isPipeline) {
    this.on('end', this._decrementPipeline.bind(this));
  }

  this.push(null);

  if (this._readable !== null) {
    this._readable.removeListener('close', this._onclose);
  }
};

Composer.prototype._decrementPipeline = function() {
  if (--this._pipelineMissing === 0) this._continueFinal(null);
};

Composer.prototype._maybeFinal = function() {
  if (this._writable !== null) {
    this._writable.removeListener('close', this._onclose);
  }

  if (this._isPipeline) this._decrementPipeline();
  else this._continueFinal(null);
};

Composer.prototype._continueFinal = function(err) {
  if (this._finalCallback === null) return;
  var cb = this._finalCallback;
  this._finalCallback = null;
  cb(err);
};

Composer.prototype._continueWrite = function(err) {
  if (this._writeCallback === null) return;
  var cb = this._writeCallback;
  this._writeCallback = null;
  cb(err);
};

// Exportar la clase Composer
module.exports = Composer;