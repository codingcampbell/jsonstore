'use strict';

require('should');
const JSONStore = require('../src/jsonstore');

describe('JSONStore', () => {
  const db = new JSONStore(':memory:');

  describe('constructor', () => {
    it('should reject missing `dbFile` parameter', () => {
      (() => new JSONStore()).should.throwError(/config/);
    });
  });

  describe('createStore', () => {
    it('should reject missing `name` parameter', () => {
      (() => db.createStore()).should.throwError(/name/);
    });

    it('should reject missing `keys` parameter', () => {
      (() => db.createStore('name')).should.throwError(/keys/);
    });

    it('should add an `id` key if it is omitted', done => {
      let keys = { foo: 'string' };
      db.createStore('name', keys);

      if (!keys.id || keys.id != 'number') {
        return done(new Error('id key not found'));
      }

      done();
    });
  });

  describe('save', () => {
    it('should reject missing `store` parameter', () => {
      (() => db.save()).should.throwError(/store/);
    });

    it('should reject missing `object` parameter', () => {
      (() => db.save('store')).should.throwError(/object/);
    });
  });
});
