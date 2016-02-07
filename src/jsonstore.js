'use strict';

const Driver = require('./driver-sqlite');

const defaultCriteria = criteria => {
  if (criteria instanceof Array) {
    return criteria.map(defaultCriteria).filter(c => c !== null);
  }

  if (!criteria) {
    return null;
  }

  // Assume non-object criteria to be value of `id` key
  if (typeof criteria === 'number' || typeof criteria === 'string') {
    criteria = { where: 'id', '=': criteria };
  }

  if (!criteria.where) {
    return null;
  }

  return criteria;
};

const wrapCriteria = criteria => {
  criteria = defaultCriteria(criteria);
  if (criteria === null) {
    return null;
  }

  if (criteria instanceof Array) {
    if (!criteria.length) {
      return null;
    }
    return criteria;
  }

  return [criteria];
};

class JSONStore {
  constructor(config, customDriver) {
    if (!config) {
      throw new Error('Missing parameter: config');
    }

    this.driver = customDriver || new Driver();
    this.driver.init(config);
  }

  createStore(name, keys) {
    if (!name) {
      throw new Error('Missing parameter: name');
    }

    if (!keys) {
      throw new Error('Missing parameter: keys');
    }

    Object.keys(keys).forEach(key => {
      keys[key] = String(keys[key]).toLowerCase();

      if (keys[key] !== 'string' && keys[key] !== 'number') {
        keys[key] = 'string';
      }
    });

    keys.id = keys.id || 'number';
    return this.driver.createStore(String(name), keys);
  }

  deleteStore(name) {
    if (!name) {
      throw new Error('Missing parameter: name');
    }

    return this.driver.deleteStore(String(name));
  }

  save(store, object, keys) {
    if (typeof store !== 'string') {
      throw new Error('Missing parameter: store (expected a string)');
    }

    if (!object) {
      throw new Error('Missing parameter: object');
    }

    keys = keys || {};

    return this.driver.save(store, object, keys);
  }

  get(store, criteria) {
    if (typeof store !== 'string') {
      throw new Error('Missing parameter: store (expected a string)');
    }

    return this.driver.get(store, wrapCriteria(criteria));
  }

  // Same as `get`, except results are streamed back one row at
  // a time instead of holding all result rows in memory
  stream(store, criteria, callback) {
    if (typeof store !== 'string') {
      throw new Error('Missing parameter: store (expected a string)');
    }

    // If `criteria` is a function, the parameter was omitted
    if (typeof criteria === 'function') {
      callback = criteria;
      criteria = null;
    }

    return this.driver.stream(store, wrapCriteria(criteria), callback);
  }

  delete(store, criteria) {
    if (typeof store !== 'string') {
      throw new Error('Missing parameter: store (expected a string)');
    }

    // If `criteria` is a function, the parameter was omitted
    if (typeof criteria === 'function') {
      criteria = null;
    }

    return this.driver.delete(store, wrapCriteria(criteria));
  }
}

module.exports = JSONStore;
