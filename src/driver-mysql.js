'use strict';

const mysql = require('mysql');
const Result = require('./result');
const util = require('./sql-util');

// Escape quotes for MySQL-compatible strings
const sanitize = str => String(str).replace(/'/g, "\\'");

// Run multiple non-prepared statements
const multiExec = (db, statements) => {
  const result = new Result();

  if (!(statements instanceof Array)) {
    statements = [statements];
  }

  statements = statements.map(statement => () => new Promise((resolve, reject) => {
    db.query(statement, err => err ? reject(err) : resolve());
  }));

  const loop = result => statements.length ? (statements.shift())().then(loop) : result;
  return loop().catch(err => util.handleError(err, result, finalResult => Promise.reject(finalResult)));
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
  query(query, params) {
    const result = new Result();
    params = params || [];

    return new Promise((resolve, reject) => {
      this.conn.query(query, params, (err, data) => {
        if (!util.handleError(err, result, reject)) {
          result.success = true;
          result.data = data;
          resolve(result);
        }
      });
    });
  }

  // Execute non-query statements
  exec(statement, params) {}

  // Get an individual store's metadata
  getMetaData(store) {
    const sql = 'SELECT data FROM __meta WHERE `store` = ?';

    return this.query(sql, [store]).then(result => {
      let meta;

      if (!result.success) {
        return Promise.reject(result);
      }

      if (!result.data || !result.data.length) {
        result.setError('No meta rows returned');
        return Promise.reject(result);
      }

      try {
        meta = JSON.parse(result.data[0].data);
      } catch (err) {
        result.setError(`Could not parse meta JSON: ${err}`);
        return Promise.reject(result);
      }

      result.success = true;
      result.data = meta;
      return result;
    });
  }

  createStore(name, keys) {
    return multiExec(this.conn, util.createStore(name, keys, sanitize, 'AUTO_INCREMENT'));
  }

  deleteStore(name) {
    const statements = [
      'START TRANSACTION',
      `DELETE FROM __meta WHERE \`store\` = '${sanitize(name)}'`,
      `DROP TABLE ${sanitize(name)}`,
      'COMMIT'
    ];

    return multiExec(this.conn, statements);
  }

  save(store, object, keys) {
    return Promise.resolve().then(() => {
      // Begin transaction
      return this.query('START TRANSACTION');
    }).then(() => {
      // Get key schema from metadata
      return this.getMetaData(store).then(result => result.data);
    }).then(meta => {
      // Insert data
      const keyData = {};

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
        object.id = keys.id;
      }

      const keyNames = Object.keys(keyData);

      // Add the serialized JSON object to the row
      keyNames.push('__jsondata');
      keyData.__jsondata = JSON.stringify(object);

      // Build insert query
      const sql = `
        REPLACE INTO \`${store}\` (
          ${keyNames.map(key => `\`${key}\``).join(', ')}
        ) VALUES (
          ${keyNames.map(key => '?').join(', ')}
        );`;

      const paramValues = keyNames.map(key => keyData[key]);

      // Execute insert statement
      return this.query(sql, paramValues).then(result => {
        // End transaction
        return this.query('COMMIT').then(() => result);
      }).then(result => {
        // If object does not have an ID key, we take
        // the ID generated by MySQL, modify the object to include it,
        // and re-save the modified object.
        if (typeof keyData.id === 'undefined') {
          if (typeof result.data.insertId !== 'undefined') {
            object.id = result.data.insertId;
            return this.save(store, object, keys);
          }

          result.setError('No ID key found in object or from MySQL');
          return Promise.reject(result);
        }

        result.data = object;
        return result;
      });
    });
  }

  getQuery(store, criteria, params) {
    return `SELECT __jsondata FROM ${store}` + util.expandCriteria(criteria, sanitize, params);
  }

  get(store, criteria) {
    const params = [];
    return this.query(this.getQuery(store, criteria, params), params).then(result => {
      if (!result.data) {
        result.setError('No JSON data returned');
        return Promise.reject(result);
      }

      try {
        result.data = JSON.parse(`[${result.data.map(r => r.__jsondata).join(',')}]`);
      } catch (err) {
        result.setError(err);
        return Promise.reject(result);
      }

      return result;
    });
  }

  stream(store, criteria) {}

  delete(store, criteria) {
    const params = [];
    const sql = `DELETE FROM ${store}` + util.expandCriteria(criteria, sanitize, params);

    return this.query(sql, params);
  }
}

module.exports = Driver;
