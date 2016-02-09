module.exports.testData = ['Mario', 'Luigi', 'Peach', 'Toad', 'Bowser'];

module.exports.insertArray = (db, data) => {
  const inserts = data.map(name => () => db.save('test', {name: name}));
  const loop = result => inserts.length ? (inserts.shift())().then(loop) : result;
  return loop();
};

module.exports.catchAll = err => {
  if (err instanceof Error) {
    return Promise.reject(err);
  }

  if (err && err.error) {
    return Promise.reject(new Error(err.error));
  }

  return Promise.reject(new Error(err));
};
