'use strict';

class Queue {
  constructor() {
    this.queue = [Promise.resolve()];
  }

  wait(fn) {
    const task = this.queue[0].then(() => this.queue.pop()).then(fn);
    this.queue.unshift(task);

    return task;
  }
}

module.exports = Queue;
