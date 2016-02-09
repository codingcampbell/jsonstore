'use strict';

const util = require('./test-util');
const mysql = require('mysql');
const JSONStore = require('../src/jsonstore');
const MysqlDriver = require('../src/driver-mysql');

const config = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'jsonstore_test'
};

const db = new JSONStore(config, new MysqlDriver());

const keys = {
  id: 'number',
  name: 'string'
};

const initDb = () => {
  const tmpConn = mysql.createConnection(config);

  return new Promise((resolve, reject) => {
    // Create database
    tmpConn.query(`drop database ${config.database}`, err => {
      if (err) {
        return reject(err);
      }

      tmpConn.query(`create database ${config.database}`, err => {
        if (err) {
          return reject(err);
        }

        tmpConn.destroy();
        resolve();
      });
    });
  }).then(() => {
    // Create object store
    return db.createStore('test', keys);
  }).catch(util.catchAll);
};

describe('MySQL Driver', () => {
  before(initDb);

  describe('createStore', () => {
    it('should create an index for each key', () => {
      return Promise.all(Object.keys(keys).map(key => {
        // Don't check non-user keys
        if (/^__/.test(key)) {
          return;
        }

        const query = `
          SELECT index_name
          FROM information_schema.statistics
          WHERE table_schema = '${config.database}'
          AND table_name = 'test'
          AND index_name = 'idx-test-${key}'`;

        return db.driver.query(query).then(result => {
          if (!result.data.length) {
            return Promise.reject(new Error(`No index for key: ${key}`));
          }
        });
      })).catch(util.catchAll);
    });

    it('should create a column for each key', () => {
      return db.driver.query('SHOW COLUMNS FROM test').then(result => {
        const rows = result.data;
        const keyNames = Object.keys(keys).filter(key => !rows.some(row => row.Field === key));

        if (!keyNames.length) {
          return;
        }

        return Promise.reject(new Error('No columns for keys: ' + keyNames.join(', ')));
      }).catch(util.catchAll);
    });

    it('should create a __meta table if one does not exist', () => {
      return db.driver.query('SHOW TABLE STATUS').then(result => {
        const hasTable = result.data.some(row => row.Name === '__meta');

        if (!hasTable) {
          return Promise.reject(new Error('No __meta table found'));
        }
      }).catch(util.catchAll);
    });

    it('should store key information in the __meta table', () => {
      return db.driver.query("SELECT data FROM __meta WHERE `store` = 'test'").then(result => {
        const keyNames = Object.keys(keys).filter(key => !/^__/.test(key));
        const row = result.data[0];
        let data;

        try {
          data = JSON.parse(row.data);
        } catch (err) {
          return Promise.reject(new Error(`Could not parse JSON: ${err}`));
        }

        if (!data || !data.keys) {
          return Promise.reject(new Error('Could not find key data'));
        }

        if (keyNames.join(',') !== data.keys.join(',')) {
          return Promise.reject(new Error('Key data does not match'));
        }
      }).catch(util.catchAll);
    });

    it('should create an `id` key/column if it is omitted', () => {
      return db.createStore('testNoId', { foo: 'string' })
        .then(() => db.driver.query('SHOW COLUMNS FROM testNoId'))
        .then(result => {
          const rows = result.data;

          if (!rows || !rows.some) {
            return Promise.reject(new Error('No columns found'));
          }

          if (!rows.some(row => row.Field === 'id')) {
            return Promise.reject(new Error('id column not found'));
          }
        })
        .catch(util.catchAll);
    });
  });

  describe('save', () => {
    let id = null;
    let newValue = null;
    const checkNewValue = () => {
      const query = 'select * from testNoId where id = ?';

      return db.driver.query(query, [id]).then(result => {
        const row = result.data[0];

        if (!row) {
          return Promise.reject(new Error("No rows returned"));
        }

        if (row.foo !== newValue) {
          return Promise.reject(new Error(`Expected \`foo\` to be: ${newValue}`));
        }
      }).catch(util.catchAll);
    };

    it('should add `id` to object if it is omitted', () => {
      return db.save('testNoId', { foo: 'bar' }).then(result => {
        if (typeof result.data.id === 'undefined') {
          return Promise.reject(new Error('`id` property missing from object'));
        }

        id = result.data.id;
      }).catch(util.catchAll);
    });

    it('should replace object when saving with an existing `id`', () => {
      newValue = 'newBar';
      return db.save('testNoId', { id, foo: newValue }, checkNewValue).catch(util.catchAll);
    });

    it('should override object values with `keys` parameter', () => {
      newValue = 'overrideBar';
      const object = { id: id, foo: 'bar' };

      return db.save('testNoId', object, { foo: newValue }, checkNewValue).catch(util.catchAll);
    });

    it('should save an array of test data', () => {
      return util.insertArray(db, util.testData).then(() => {
        return db.get('test').then(result => {
          if (!result.data.length) {
            return Promise.reject(new Error('No data after save'));
          }
        });
      }).catch(util.catchAll);
    });
  });

  describe('delete', () => {
    const getItemCount = () => db.get('test').then(result => result.data.length);

    it('should delete only the item that matches the criteria', () => {
      return getItemCount().then(beforeCount => {
        const criteria = { where: 'name', '=': 'Mario' };

        return db.delete('test', criteria)
          .then(getItemCount)
          .then(afterCount => {
            if (afterCount !== beforeCount - 1) {
              return Promise.reject(new Error('Unexpected deletion count'));
            }
          });
      }).catch(util.catchAll);
    });

    it('should delete all items when there is no criteria', () => {
      return db.delete('test')
        .then(getItemCount)
        .then(count => {
          if (count !== 0) {
            return Promise.reject(new Error(`Expected count to be 0, not ${count}`));
          }
        })
        .catch(util.catchAll);
    });
  });

  describe('deleteStore', () => {
    it('should remove key information from the __meta table', () => {
      return db.deleteStore('test')
        .then(() => db.driver.query("SELECT data FROM __meta WHERE `store` = 'test'"))
        .then(result => {
          const row = result.data[0];

          if (row && row.data) {
            return Promise.reject(new Error('Data still exists in __meta table'));
          }
        })
        .catch(util.catchAll);
    });

    it('should remove the table for the store', () => {
      db.get('test')
        .then(() => Promise.reject(new Error('Table still exists')))
        .catch(() => Promise.resolve());
    });
  });
});
