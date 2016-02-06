'use strict';

const JSONStore = require('../src/jsonstore');
const async = require('async');

const db = new JSONStore(':memory:');
const keys = {
  id: 'number',
  name: 'string'
};
const keyCount = Object.keys(keys).length
const testData = ['Mario', 'Luigi', 'Peach', 'Toad', 'Bowser'];

const insertArray = (data, callback) => {
  const inserts = data.map(name => callback =>
    db.save('test', {name: name}, result => {
      if (!result.success) {
        return callback(result);
      }

      callback(null, result);
    })
  );

  async.series(inserts, callback);
};

const initDb = callback => {
  db.createStore('test', keys, result => {
    if (!result.success) {
      return callback(result.error);
    }

    callback();
  });
};

describe('SQLite Driver', () => {
  before(initDb);
  describe('createStore', () => {
    it('should create an index for each key', done => {
      let count = 0;
      const rowExists = function(err, row) {
        if (count < 0) {
          return;
        }

        if (!row) {
          // Only throw error if this key was not user-specified
          if (!/^__/.test(this)) {
            count = -1;
            return done(new Error(`No index for key: ${this}`));
          }
        }

        count += 1;
        if (count === keyCount) {
          done();
        }
      };

      Object.keys(keys).forEach(key => {
        const query = `SELECT * FROM sqlite_master WHERE \`name\` = 'idx-test-${key}'`;
        db.driver.db.get(query, rowExists.bind(key));
      });
    });

    it('should create a column for each key', done => {
      db.driver.db.all('PRAGMA table_info(test)', (err, rows) => {
        if (err) {
          return done(new Error(err));
        }

        const keyNames = Object.keys(keys).filter(key => !rows.some(row => row.name === key));

        if (!keyNames.length) {
          return done();
        }

        done(new Error('No columns for keys: ' + keyNames.join(', ')))
      });
    });

    it('should create a __meta table if one does not exist', done => {
      db.driver.db.all('PRAGMA table_info(__meta)', (err, rows) => {
        if (err) {
          return done(new Error(err));
        }

        if (!rows || !rows.length) {
          return done(new Error('No __meta table found'));
        }

        done();
      });
    });

    it('should store key information in the __meta table', done => {
      const query = "SELECT data FROM __meta WHERE `store` = 'test'";

      db.driver.db.get(query, (err, row) => {
        const keyNames = Object.keys(keys).filter(key => !/^__/.test(key));
        let data;

        if (err) {
          return done(new Error(err));
        }

        try {
          data = JSON.parse(row.data);
        } catch (err) {
          return done(new Error(`Could not parse JSON: ${err}`));
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
      });

      db.driver.db.all('PRAGMA table_info(testNoId)', (err, rows) => {
        if (err) {
          return done(new Error(result.error));
        }

        if (!rows || !rows.some) {
          return done(new Error('No columns found'));
        }

        if (rows.some(row => row.name === 'id')) {
          return done();
        }

        done(new Error('id column not found'));
      });
    });
  });

  describe('save', () => {
    let id = null;
    let newValue = null;
    const checkNewValue = done => result => {
      const query = 'select * from testNoId where id = ?'

      db.driver.db.get(query, id, (err, result) => {
        if (err) {
          return done(new Error(err));
        }

        if (!result) {
          return done(new Error("No rows returned"));
        }

        if (result.foo === newValue) {
          return done();
        }

        done(new Error(`Expected \`foo\` to be: ${newValue}`));
      });
    };

    it('should add `id` to object if it is omitted', done => {
      db.save('testNoId', { foo: 'bar' }, (result) => {
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

      db.save('testNoId', { id: id, foo: newValue }, checkNewValue(done));
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
          const criteria = { where: 'name', '=': 'Mario' }

          db.delete('test', criteria, (result) => {
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
        },
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
      ], done);
    });
  });

  describe('deleteStore', () => {
    it('should remove key information from the __meta table', done => {
      db.deleteStore('test', result => {
        if (!result.success) {
          return done(new Error(result.error));
        }

        const query = "SELECT data FROM __meta WHERE `store` = 'test'";

        db.driver.db.get(query, (err, row) => {
          if (err) {
            return done(new Error(err));
          }

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
