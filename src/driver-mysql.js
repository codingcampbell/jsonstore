'use strict';

const async = require('async');
const mysql = require('mysql');
const Result = require('./result');
const util = require('./sql-util');
const noop = function() {};

// Escape quotes for MySQL-compatible strings
const sanitize = str => String(str).replace(/'/g, "\\'");

// Run multiple non-prepared statements
const multiExec = (db, statements, callback) => {
  let result = new Result();

  if (!(statements instanceof Array)) {
    statements = [statements];
  }

  callback = callback || noop;

  statements = statements.map(statement => next =>
    db.query(statement, next)
  );

  async.series(statements, (err, result) => {
    if (util.handleError(err, result, callback)) {
      return noop;
    }

    result.success = true;
    callback(result);
  });
};

class Driver {
  init(config) {
    this.open(config);
  }

  open(config) {
    this.config = config || this.config;
    this.conn = mysql.createConnection(this.config);
  }

  // General query that wraps rows in a Result object
  query(query, params, callback) {
    let result = new Result();

    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    this.conn.query(query, params, (err, data) => {
      if (!util.handleError(err, result, callback)) {
        result.success = true;
        result.data = data;
        callback(result);
      }
    });
  }

  // Execute non-query statements
  exec(statement, params, callback) {}

  // Get an individual store's metadata
  getMetaData(store, callback) {
    let sql = 'SELECT data FROM __meta WHERE `store` = ?'

    this.query(sql, [store], result => {
      let meta;

      if (!result.success) {
        return callback(result);
      }

      if (!result.data || !result.data.length) {
        result.setError('No meta rows returned');
        return callback(result);
      }

      try {
        meta = JSON.parse(result.data[0].data)
      } catch (err) {
        result.setError(`Could not parse meta JSON: ${err}`);
        return callback(result);
      }

      result.success = true;
      result.data = meta;
      return callback(result);
    });
  }

  createStore(name, keys, callback) {
    let statements = util.createStore(name, keys, sanitize, 'AUTO_INCREMENT');
    multiExec(this.conn, statements, callback);
  }

  deleteStore(name, callback) {
    let statements = [
      'START TRANSACTION',
      `DELETE FROM __meta WHERE \`store\` = '${sanitize(name)}'`,
      `DROP TABLE ${sanitize(name)}`,
      'COMMIT'
    ];

    multiExec(this.conn, statements, callback);
  }

  save(store, object, keys, callback) {
    return async.waterfall([
      // Begin transaction
      callback => this.query('START TRANSACTION', () => callback(null)),

      // Get key schema from metadata
      callback => this.getMetaData(store, result => {
        if (!result.success) {
          return callback(result);
        }

        callback(null, result.data);
      }),

      // Insert data
      (meta, callback) => {
        let keyData = {};

        // Skim the object for top-level keys
        Object.keys(object).forEach(key => {
          if (meta.keys.indexOf(key) !== -1) {
            keyData[key] = object[key];
          }
        });

        // Allow keys param to override assumed key values
        Object.keys(keys).forEach(key => {
          if (meta.keys.indexOf(key) !== -1) {
            keyData[key] = keys[key];
          }
        });

        // Make sure an overidden ID key makes it into the object
        if (typeof keys.id !== 'undefined') {
          object.id = keys.id
        }

        let keyNames = Object.keys(keyData);

        // Add the serialized JSON object to the row
        keyNames.push('__jsondata');
        keyData['__jsondata'] = JSON.stringify(object);

        // Build insert query
        let sql = `
          REPLACE INTO \`${store}\` (
            ${keyNames.map(key => `\`${key}\``).join(', ')}
          ) VALUES (
            ${keyNames.map(key => '?').join(', ')}
          );`;

        let paramValues = keyNames.map(key => keyData[key]);

        // Execute insert statement
        this.query(sql, paramValues, result => {
          if (!result.success) {
            return callback(result);
          }

          // If object does not have an ID key, we take
          // the ID generated by MySQL, modify the object to include it,
          // and re-save the modified object.
          if (typeof keyData['id'] === 'undefined') {
            if (typeof result.data.insertId !== 'undefined') {
              object.id = result.data.insertId;
              return this.save(store, object, keys, result => callback(null, result));
            }

            result.setError('No ID key found in object or from MySQL');
            return callback(result);
          }

          result.data = object;
          callback(null, result);
        });
      },

      // Process result and notify callbacks of errors
      (result, callback) => {
        if (!result.success) {
          return callback(result);
        }

        callback(null, result);
      },

      // End transaction
      (result, callback) => this.query('COMMIT', () => callback(null, result))
    ], (err, result) => callback(err || result));
  }

  getQuery(store, criteria, params) {
    return `SELECT __jsondata FROM ${store}` + util.expandCriteria(criteria, sanitize, params);
  }

  get(store, criteria, callback) {
    let params = [];
    this.query(this.getQuery(store, criteria, params), params, result => {
      if (!result.success) {
        return callback(result);
      }

      if (!result.data) {
        result.setError('No JSON data returned');
        return callback(result);
      }

      try {
        result.data = JSON.parse(`[${result.data.map(r => r['__jsondata']).join(',')}]`);
      } catch (err) {
        result.setError(err);
        return callback(result);
      }

      callback(result);
    });
  }

  stream(store, criteria, callback) {}

  delete(store, criteria, callback) {
    let params = [];
    let sql = `DELETE FROM ${store}` + util.expandCriteria(criteria, sanitize, params);

    this.query(sql, params, callback);
  }
};

module.exports = Driver;
