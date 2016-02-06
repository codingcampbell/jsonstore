'use strict';

const mysql = require('mysql');
const JSONStore = require('../src/jsonstore');
const MysqlDriver = require('../src/driver-mysql');
const async = require('async');

const config = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'jsonstore_test'
};

let db = new JSONStore(config, new MysqlDriver());

const keys = {
  id: 'number',
  name: 'string'
};

const testData = ['Mario', 'Luigi', 'Peach', 'Toad', 'Bowser'];

const insertArray = (data, callback) => {
  const inserts = data.map(name => callback =>
    db.save('test', {name: name}, result => {
      if (!result.success) {
        return callback(result);
      }

      callback(null, result);
    }))

  async.series(inserts, callback);
};

const initDb = done => async.series([
  // Create database
  callback => {
    const tmpConn = mysql.createConnection(config);
    tmpConn.query(`drop database ${config.database}`, (err, data) => {
      if (err) {
        return callback(err);
      }

      tmpConn.query(`create database ${config.database}`, (err, data) => {
        tmpConn.destroy();
        callback(err || null);
      });
    });
  },

  // Create object store
  callback => db.createStore('test', keys, result =>
    callback(result.error || null)
  )
], err => done(err));

describe('MySQL Driver', () => {
  before(initDb);

  describe('createStore', () => {
    it('should create an index for each key', done => {
      async.each(Object.keys(keys), (key, callback) => {
        // Don't check non-user keys
        if (/^__/.test(key)) {
          return callback();
        }

        const query = `
          SELECT index_name
          FROM information_schema.statistics
          WHERE table_schema = '${config.database}'
          AND table_name = 'test'
          AND index_name = 'idx-test-${key}'`;

        db.driver.query(query, result => {
          if (!result.success) {
            return callback(result.error);
          }

          if (!result.data.length) {
            return callback(new Error(`No index for key: ${key}`));
          }

          callback();
        });

      }, done);
    });

    it('should create a column for each key', done => {
      db.driver.query('SHOW COLUMNS FROM test', result => {
        if (!result.success) {
          return done(result.error);
        }

        const rows = result.data;
        const keyNames = Object.keys(keys).filter(key => !rows.some(row => row.Field === key));

        if (!keyNames.length) {
          return done();
        }

        done(new Error('No columns for keys: ' + keyNames.join(', ')));
      });
    });

    it('should create a __meta table if one does not exist', done => {
      db.driver.query('SHOW TABLE STATUS', result => {
        if (!result.success) {
          return done(result.error);
        }

        const hasTable = result.data.some(row => row.Name === '__meta');

        if (!hasTable) {
          return done(new Error('No __meta table found'));
        }

        done();
      });
    });

    it('should store key information in the __meta table', done => {
      db.driver.query("SELECT data FROM __meta WHERE `store` = 'test'", result => {
        const keyNames = Object.keys(keys).filter(key => !/^__/.test(key));

        if (result.error) {
          return done(new Error(result.error));
        }

        const row = result.data[0];
        let data;

        try {
          data = JSON.parse(row.data);
        } catch (err) {
          return done(new Error(`Could not parse JSON: ${err}`))
        }

        if (!data || !data.keys) {
          return done(new Error('Could not find key data'));
        }

        if (keyNames.join(',') !== data.keys.join(',')) {
          return done(new Error('Key data does not match'));
        }

        done();
      });
    });

    it('should create an `id` key/column if it is omitted', done => {
      db.createStore('testNoId', { foo: 'string' }, result => {
        if (!result.success) {
          return done(new Error(result.error));
        }

        db.driver.query('SHOW COLUMNS FROM testNoId', result => {
          if (result.error) {
            return done(new Error(result.error));
          }

          const rows = result.data;

          if (!rows || !rows.some) {
            return done(new Error('No columns found'));
          }

          if (rows.some(row => row.Field === 'id')) {
            return done();
          }

          done(new Error('id column not found'));
        });
      });
    });
  });

  describe('save', () => {
    let id = null;
    let newValue = null;
    const checkNewValue = done => () => {
      const query = 'select * from testNoId where id = ?';

      db.driver.query(query, [id], result => {
        if (!result.success) {
          return done(new Error(result.error));
        }

        const row = result.data[0];

        if (!row) {
          return done(new Error("No rows returned"));
        }

        if (row.foo === newValue) {
          return done();
        }

        done(new Error(`Expected \`foo\` to be: ${newValue}`));
      });
    };

    it('should add `id` to object if it is omitted', done => {
      db.save('testNoId', { foo: 'bar' }, result => {
        if (!result.success) {
          return done(new Error(result.error));
        }

        if (typeof result.data.id === 'undefined') {
          return done(new Error('`id` property missing from object'));
        }

        id = result.data.id;
        done();
      });
    });

    it('should replace object when saving with an existing `id`', done => {
      newValue = 'newBar';
      db.save('testNoId', { id, foo: newValue }, checkNewValue(done));
    });

    it('should override object values with `keys` parameter', done => {
      newValue = 'overrideBar';
      const object = { id: id, foo: 'bar' };

      db.save('testNoId', object, { foo: newValue }, checkNewValue(done));
    });

    it('should save an array of test data', done => {
      insertArray(testData, (err, result) => {
        if (err) {
          return done(err);
        }

        db.get('test', result => {
          if (!result.success) {
            return done(result.error);
          }

          if (!result.data.length) {
            return done(new Error('No data after save'));
          }

          done();
        });
      });
    });
  });

  describe('delete', () => {
    const getItemCount = callback => db.get('test', result => {
      if (!result.success) {
        return callback(result.error);
      }

      callback(null, result.data.length);
    });

    it('should delete only the item that matches the criteria', done => {
      async.waterfall([
        getItemCount,

        (beforeCount, callback) => {
          const criteria = { where: 'name', '=': 'Mario' };

          db.delete('test', criteria, result => {
            if (!result.success) {
              return callback(result.error);
            }

            getItemCount((err, afterCount) => callback(err, beforeCount, afterCount));
          });
        },

        (beforeCount, afterCount, callback) => {
          if (afterCount === beforeCount - 1) {
            return callback(null);
          }

          callback(new Error('Unexpected deletion count'));
        }
      ], done);
    });

    it('should delete all items when there is no criteria', done => {
      async.waterfall([
        callback => db.delete('test', result => {
          if (!result.success) {
            return callback(result.error);
          }

          callback(null);
        }),

        getItemCount,

        (count, callback) => {
          if (count === 0) {
            return callback(null);
          }

          callback(new Error(`Expected count to be 0, not ${count}`));
        }
      ], done)
    });
  });

  describe('deleteStore', () => {
    it('should remove key information from the __meta table', done => {
      db.deleteStore('test', result => {
        if (!result.success) {
          return done(new Error(result.error));
        }

        const query = "SELECT data FROM __meta WHERE `store` = 'test'";

        db.driver.query(query, result => {
          if (!result.success) {
            return done(new Error(result.error));
          }

          const row = result.data[0];

          if (row && row.data) {
            return done(new Error('Data still exists in __meta table'));
          }

          done();
        });
      });
    });

    it('should remove the table for the store', done => {
      db.get('test', result => {
        if (result.success) {
          return done(new Error('Table still exists'));
        }

        done();
      });
    });
  });
});
