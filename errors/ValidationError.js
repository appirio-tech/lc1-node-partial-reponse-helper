'use strict';

/**
 * Validation error.
 * The Default HTTP STATUS CODE for ValidationError is 400 (HTTP BAD REQUEST)
 *
 * @author      spanhawk
 * @version     0.0.1
 */

/* Globals */
var HTTP_BAD_REQUEST = 400;
var NAME = 'ValidationError';

/**
 * Constrcutor
 *
 * @param {String}      message       The validation error message
 */
function ValidationError(message) {
  this.name = NAME;
  this.message = message;
  this.code = HTTP_BAD_REQUEST;
}

ValidationError.prototype = new Error();

/**
 * Module exports
 */
module.exports = ValidationError;