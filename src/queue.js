'use strict';

class Queue {
  constructor() {
    this.queue = [];
    this.waiting = false;
  }

  dequeue() {
    if (this.waiting || !this.queue.length) {
      return;
    }

    this.waiting = true;
    this.queue.shift().call(this, function() {
      this.waiting = false;
      this.dequeue();
    }.bind(this));
  }

  enqueue(callback) {
    this.queue.push(callback);
    this.dequeue();
  }

  wait(promiseFn) {
    return new Promise((resolve, reject) =>
      this.enqueue(done =>
        promiseFn().then(x => { done(x); return resolve(x); }).catch(x => { done(x); return reject(x); })
      )
    );
  }
}

module.exports = Queue;
