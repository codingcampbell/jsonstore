'use strict';

const util = require('./test-util');
const JSONStore = require('../src/jsonstore');

const db = new JSONStore(':memory:');

const keys = {
  id: 'number',
  name: 'string'
};

const keyCount = Object.keys(keys).length;

const initDb = () => db.createStore('test', keys);

describe('SQLite Driver', () => {
  before(initDb);
  describe('createStore', () => {
    it('should create an index for each key', () => new Promise((resolve, reject) => {
      let count = 0;
      const rowExists = function(err, row) {
        if (err) {
          return reject(new Error(err));
        }

        if (count < 0) {
          return;
        }

        if (!row) {
          // Only throw error if this key was not user-specified
          if (!/^__/.test(this)) {
            count = -1;
            return reject(new Error(`No index for key: ${this}`));
          }
        }

        count += 1;
        if (count === keyCount) {
          resolve();
        }
      };

      Object.keys(keys).forEach(key => {
        const query = `SELECT * FROM sqlite_master WHERE \`name\` = 'idx-test-${key}'`;
        db.driver.db.get(query, rowExists.bind(key));
      });
    }).catch(util.catchAll));

    it('should create a column for each key', () => new Promise((resolve, reject) => {
      db.driver.db.all('PRAGMA table_info(test)', (err, rows) => {
        if (err) {
          return reject(new Error(err));
        }

        const keyNames = Object.keys(keys).filter(key => !rows.some(row => row.name === key));

        if (!keyNames.length) {
          return resolve();
        }

        reject(new Error('No columns for keys: ' + keyNames.join(', ')));
      });
    }).catch(util.catchAll));

    it('should create a __meta table if one does not exist', () => new Promise((resolve, reject) => {
      db.driver.db.all('PRAGMA table_info(__meta)', (err, rows) => {
        if (err) {
          return reject(new Error(err));
        }

        if (!rows || !rows.length) {
          return reject(new Error('No __meta table found'));
        }

        resolve();
      });
    }).catch(util.catchAll));

    it('should store key information in the __meta table', () => new Promise((resolve, reject) => {
      const query = "SELECT data FROM __meta WHERE `store` = 'test'";

      db.driver.db.get(query, (err, row) => {
        const keyNames = Object.keys(keys).filter(key => !/^__/.test(key));
        let data;

        if (err) {
          return reject(new Error(err));
        }

        try {
          data = JSON.parse(row.data);
        } catch (err) {
          return reject(new Error(`Could not parse JSON: ${err}`));
        }

        if (!data || !data.keys) {
          return reject(new Error('Could not find key data'));
        }

        if (keyNames.join(',') !== data.keys.join(',')) {
          return reject(new Error('Key data does not match'));
        }

        resolve();
      });
    }).catch(util.catchAll));

    it('should create an `id` key/column if it is omitted', () => {
      return db.createStore('testNoId', { foo: 'string' }).then(() => new Promise((resolve, reject) => {
        db.driver.db.all('PRAGMA table_info(testNoId)', (err, rows) => {
          if (err) {
            return reject(new Error(err));
          }

          if (!rows || !rows.some) {
            return reject(new Error('No columns found'));
          }

          if (rows.some(row => row.name === 'id')) {
            return resolve();
          }

          reject(new Error('id column not found'));
        });
      })).catch(util.catchAll);
    });
  });

  describe('save', () => {
    let id = null;
    let newValue = null;
    const checkNewValue = () => {
      const query = 'select * from testNoId where id = ?';

      return new Promise((resolve, reject) => {
        db.driver.db.get(query, id, (err, result) => {
          if (err) {
            return reject(new Error(err));
          }

          if (!result) {
            return reject(new Error("No rows returned"));
          }

          if (result.foo === newValue) {
            return resolve();
          }

          reject(new Error(`Expected \`foo\` to be: ${newValue}`));
        });
      }).catch(util.catchAll);
    };

    it('should add `id` to object if it is omitted', () => {
      return db.save('testNoId', { foo: 'bar' }).then(result => {
        if (!result.success) {
          return Promise.reject(new Error(result.error));
        }

        if (typeof result.data.id === 'undefined') {
          return Promise.reject(new Error('`id` property missing from object'));
        }

        id = result.data.id;
      }).catch(util.catchAll);
    });

    it('should replace object when saving with an existing `id`', () => {
      newValue = 'newBar';
      return db.save('testNoId', { id, foo: newValue })
        .then(checkNewValue)
        .catch(util.catchAll);
    });

    it('should override object values with `keys` parameter', () => {
      newValue = 'overrideBar';
      const object = { id, foo: 'bar' };

      return db.save('testNoId', object, { foo: newValue })
        .then(checkNewValue)
        .catch(util.catchAll);
    });

    it('should save an array of test data', () => {
      return util.insertArray(db, util.testData)
        .then(() => db.get('test'))
        .then(result => {
          if (!result.data.length) {
            return Promise.reject(new Error('No data after save'));
          }

          return result;
        })
        .catch(util.catchAll);
    });
  });

  describe('delete', () => {
    const getItemCount = () => db.get('test').then(result => result.data.length);

    it('should delete only the item that matches the criteria', () => {
      return getItemCount()
        .then(beforeCount => {
          const criteria = { where: 'name', '=': 'Mario' };

          return db.delete('test', criteria)
            .then(getItemCount)
            .then(afterCount => {
              if (afterCount === beforeCount - 1) {
                return;
              }

              return Promise.reject(new Error('Unexpected deletion count'));
            });
        })
        .catch(util.catchAll);
    });

    it('should delete all items when there is no criteria', () => {
      return db.delete('test')
        .then(getItemCount)
        .then(count => {
          if (count === 0) {
            return;
          }

          return Promise.reject(new Error(`Expected count to be 0, not ${count}`));
        })
        .catch(util.catchAll);
    });
  });

  describe('deleteStore', () => {
    it('should remove key information from the __meta table', () => {
      return db.deleteStore('test').then(() => {
        const query = "SELECT data FROM __meta WHERE `store` = 'test'";

        db.driver.db.get(query, (err, row) => {
          if (err) {
            return Promise.reject(new Error(err));
          }

          if (row && row.data) {
            return Promise.reject(new Error('Data still exists in __meta table'));
          }
        });
      }).catch(util.catchAll);
    });

    it('should remove the table for the store', () => {
      return db.get('test')
        .then(() => Promise.reject(new Error('Table still exists')))
        .catch(() => Promise.resolve());
    });
  });
});
