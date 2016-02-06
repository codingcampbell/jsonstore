'use strict';

class Result {
  constructor() {
    this.data = {};
    this.success = false;
    this.error = null;
  }

  setError(error) {
    this.success = false;
    this.error = error;
  }
}

module.exports = Result;
