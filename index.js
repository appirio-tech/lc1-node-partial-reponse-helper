'use strict';
/**
 * Partial response module for serenity applications
 *
 * @author    spanhawk
 * @version   0.0.1
 */

var _ = require('lodash');
var async = require('async');
var inflection = require('inflection');
var ValidationError = require('./errors/ValidationError');
var dataSource_ = null;

/**
 * Constructor function
 */
function PartialResponse(datasource) {
  if(_.isUndefined(datasource)) {
    throw new Error('datasource should be defined');
  }
  dataSource_ = datasource;
}

/**
 * Judge whether the input character is accepted or not.
 * @param    {character}    char    The character to validate
 * @return   {boolean}              True/False whether the character is allowed or not
 */
function allowedCharacter(char) {
  var allowedCharacterList = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  allowedCharacterList += 'abcdefghijklmnopqrstuvwxyz';
  allowedCharacterList += '_,()';
  for (var i = 0; i < allowedCharacterList.length; i += 1) {
    if (char === allowedCharacterList[i]) {
      return true;
    }
  }
  return false;
}

/**
 * return offset
 * @param   {Object}    req       Express request instance
 * @param   {String}    string    String for which offset to find
 * @param   {Function}  next      Next function
 * @return  {number}              offset value
 */
function findRightBracket(req, string, next) {
  var error = null;
  var count = 0;
  for (var i = 0; i < string.length; i += 1) {
    if (string[i] === ')') {
      if (i === 0) {
        error = new ValidationError('Fields parameter cannot take empty object ().');
        return next(error);
      }
      if (count === 0) {
        return i + 1;
      } else {
        count -= 1;
      }
    }
    if (string[i] === '(') {
      count += 1;
    }
  }
  error = new ValidationError('Fields parameter must take entire pair of \'()\'.');
  next(error);
}

/**
 *
 * @param {Object}      req       Express request instance
 * @param {String}      param     string waiting to parse
 * @param {Object}      entity    the parsed object will append to this entity's key
 * @param {String}      property  the key in entity
 * @param {Function}    next      next funtion
 */
function iterationParse(req, param, entity, property, next) {
  var error = null;
  var subObject = null;
  if (!property) {
    subObject = entity;
  } else {
    subObject = entity[property];
  }
  var cache = '';
  for (var i = 0; i < param.length; i += 1) {
    if (i === (param.length - 1)) {
      if (allowedCharacter(param[i]) && param[i]!=='(' && param[i]!==',') {
        cache += param[i];
        subObject[cache] = true;
        cache = '';
      } else {
        error = new ValidationError('Fields parameter cannot end up with a \'' + param[i] + '\' .');
        return next(error);
      }
      return;
    } else if (param[i] === ',') {
      if (i === 0) {
        error = new ValidationError('Fields parameter cannot start with a \',\' .');
        return next(error);
      }
      subObject[cache] = true;
      cache = '';
    } else if (param[i] === '(') {
      var rightPos = i + findRightBracket(req, param.substring(i + 1, param.length), next);
      //Now cache is a plural for the name of a known model.
      subObject[cache] = {};
      iterationParse(req, param.substring(i + 1, rightPos), subObject, cache, next);
      cache = '';
      i = rightPos + 1;
      if (param[i]) {
        if (param[i] === ')') {
          error = new ValidationError('Fields parameter must take entire pair of \'()\' .');
          return next(error);
        } else if (!allowedCharacter(param[i])) {
          error = new ValidationError('Fields parameter cannot contain character \'' + param[i] + '\' .');
          return next(error);
        } else if (param[i] !== ',') {
          error = new ValidationError('Fields parameter format error.');
          return next(error);
        }
      }
    } else {
      if (allowedCharacter(param[i])) {
        cache += param[i];
      } else {
        error = new ValidationError('Fields parameter cannot contain character \'' + param[i] + '\' .');
        return next(error);
      }
    }
  }
}

/**
 * If Model has this key, return true. Otherwise false.
 * @param Model
 * @param key
 */
function _hasKey(Model, key){
  var has = false;
  _.forEach(_.keys(Model.rawAttributes), function (column) {
    if (key === column) {
      has = true;
    }
  });
  return has;
}

/**
 * If Model has many models, return true. Otherwise false.
 * Support caml-case item: Model Scorecard, models: scorecardItems
 * @param Model
 * @param models
 */
function _hasMany(Model, models){
  var has = false;
  _.forEach(Model.associations, function (association) {
    if ( (association.as === models ||
            models === inflection.camelize(association.as, true) ) &&
      association.associationType === 'HasMany') {
        has = true;
    }
  });
  return has;
}

/**
 * IF Model has this foreign key, return reference Model Name and foreignKey. Otherwise false.
 * This depends on the the sequelize model definition.
 * Model.belongsTo(FatherModel, {foreignKey: key})
 * @param Model
 * @param key
 */
function _hasForeignKey(Model, key){
  var has = null;
  _.forEach(Model.associations, function(association){
    if( (association.identifier===key+'Id' ||
          association.identifier===inflection.singularize(key)+'Id') &&
        association.associationType === 'BelongsTo'){
          has = [];
          has[0] = association.target.name;
          has[1] = association.identifier;
        }
  });
  return has;
}

/**
 *
 * @param req request object
 * @param Model Model need to be reduced
 * @param Entity the response entity wrapper
 * @param Property the key
 * @param Fields fields won't be reduced
 * @param callback
 */
function recursionReduce(req, Model, Entity, Property, Fields, callback){
  var error = null;
  var subObject = Entity[Property];
  if(_.isArray(subObject)){

    var tasks = [];
    var index=-1;
    _.forEach(subObject, function(entity){

      tasks.push(function(callback){

        var reducedObject = {};
        var tasksB = [];
        if(!_.isObject(Fields)){
          if(!subObject){
            callback(null);
            return;
          }
          reducedObject = entity.values;
        }else{
          _.forEach(_.keys(Fields), function(key){
            tasksB.push(function(callback){
              if(_hasKey(Model, key)){
                reducedObject[key] = entity.values[key];
                callback(null);
              }else if(_hasMany(Model, key)){
                var modelName = inflection.capitalize(inflection.singularize(key));
                if(!dataSource_[modelName]){
                  modelName = inflection.camelize( inflection.underscore(key) ).slice(0, -1);
                }

                var foreignKey = Model.name.toLowerCase() + 'Id';
                var filter = {};
                filter[foreignKey] = entity.id;
                dataSource_[modelName].findAll({where: filter}).success(function(entities){
                  reducedObject[key] = entities;
                  recursionReduce(req, dataSource_[modelName], reducedObject, key, Fields[key], callback);
                }).error(function(err) {
                  reducedObject[key] = [];
                  callback(err);
                });
              }else{
                var reference = _hasForeignKey(Model, key);
                if(!reference){
                  error = new ValidationError(Model.name+' doesn\'t has ' + key);
                  callback(error);
                }else{
                  var filterOne = {};
                  filterOne.id = entity[reference[1]];
                  dataSource_[reference[0]].find({where: filterOne}).success(function(entity){
                    reducedObject[key] = entity;
                    recursionReduce(req, dataSource_[reference[0]], reducedObject, key, Fields[key], callback);
                  }).error(function(err){
                    callback(err);
                  });
                }
              }
            });
          });
        }

        index += 1;
        subObject[index] = reducedObject;
        async.series(tasksB, function(){
          callback(null);
        });
      });

    });

    async.series(tasks, function(){
      callback();
    });
  }else{

    var reducedObject = {};
    var tasksC = [];

    if(!_.isObject(Fields)){
      if(!subObject){
        callback(null);
        return;
      }
      reducedObject = subObject.values;
    }else{
      _.forEach(_.keys(Fields), function(key){
        tasksC.push(function(callback){
          if(_hasKey(Model, key)){
            reducedObject[key] = subObject.values[key];
            callback(null);
          }else if(_hasMany(Model, key)){
            var modelName = inflection.capitalize(inflection.singularize(key));
            if(!dataSource_[modelName]){
              modelName = inflection.camelize( inflection.underscore(key) ).slice(0, -1);
            }

            var foreignKey = Model.name.toLowerCase() + 'Id';
            var filter = {};
            filter[foreignKey] = subObject.id;
            dataSource_[modelName].findAll({where: filter}).success(function(entities){
              reducedObject[key] = entities;
              recursionReduce(req, dataSource_[modelName], reducedObject, key, Fields[key], callback);
            }).error(function(err){
              reducedObject[key] = [];
              callback(err);
            });
          } else{
            var reference = _hasForeignKey(Model, key);
            if(!reference){
              error = new ValidationError(Model.name+' doesn\'t has ' + key);
              callback(error);
            }else{
              var filterOne = {};
              filterOne.id = subObject[reference[1]];
              dataSource_[reference[0]].find({where: filterOne}).success(function(entity){
                reducedObject[key] = entity;
                recursionReduce(req, dataSource_[reference[0]], reducedObject, key, Fields[key], callback);
              }).error(function(err){
                callback(err);
              });
            }
          }
        });
      });
    }
    Property = inflection.singularize(Property);
    delete Entity[inflection.pluralize(Property)];
    Entity[Property] = reducedObject;
    async.series(tasksC, function(){
      callback();
    });
  }
}

/**
 * Parse fields parameter if exist in all get call.
 * @param   req     Express request instance
 * @param   res     Express response instance
 * @param   next    Express next function
 */
PartialResponse.prototype.parseFields = function (req, res, next) {
  var error = null;
  var param = req.query.fields;
  delete req.query.fields;
  if (param && typeof param === 'string') {
    param = param.trim();
    var fields = {};
    if (req.method !== 'GET') {
      error = new ValidationError('Fields parameter is not allowed for ' + req.method + ' call.');
      return next(error);
    } else {
      iterationParse(req, param, fields, null, next);
    }
    //append to req object
    req.partialResponse = fields;
  }
  next();
};

PartialResponse.prototype.reduceFieldsAndExpandObject = function(Model, req, next) {
  if (!req.data || !req.data.content || !req.partialResponse || req.error) {
    next();
  } else {
    recursionReduce(req, Model, req.data, 'content', req.partialResponse, next);
  }
};

/**
 * Module exports
 */
module.exports = PartialResponse;