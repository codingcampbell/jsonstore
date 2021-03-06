'use strict';

// This module provides shared functionality for SQL-based drivers

const operators = ['<', '<=', '>', '>=', '=', '!='];

const buildCriteria = (criteria, sanitize, params, sub) => {
  if (criteria.where) {
    criteria = { 'and': criteria };
  }

  if (!criteria.and && !criteria.or) {
    if (criteria.constructor !== Array) {
      criteria = [criteria];
    }

    criteria = { 'and': criteria };
  }

  let mode = 'and';

  if (criteria.or) {
    mode = 'or';
  }

  let list = criteria[mode];
  if (list.constructor !== Array) {
    list = [list];
  }

  let result = '(';
  if (sub) {
    result = ' ' + mode.toUpperCase() + ' ' + result;
  }

  return result + list.map(condition => {
    let op = condition.op = operators.filter(key => typeof condition[key] !== 'undefined');
    let value;

    condition.value = condition[condition.op];

    if (condition.value === null) {
      op = 'IS';

      if (condition.op === '!=') {
        op = 'IS NOT';
      }

      // Unescaped NULL for SQL
      value = 'NULL';
    } else {
      if (typeof condition.value === 'number') {
        value = condition.value;
      } else if (typeof condition.value === 'boolean') {
        value = condition.value;
      } else {
        value = '"' + sanitize(condition.value) + '"';
      }
    }

    if (params) {
      params.push(condition.value);
      value = '?';
    }

    if (condition.and) {
      value += buildCriteria({ 'and': condition.and }, sanitize, params, true);
    } else if (condition.or) {
      value += buildCriteria({ 'or': condition.or }, sanitize, params, true);
    }

    return `(\`${condition.where}\` ${op} ${value})`;
  }).join(' ' + mode.toUpperCase() + ' ') + ')';
};

// Create statements for creating an object store
const createStore = (name, keys, sanitize, autoincrement) => {
  const statements = [];
  const columns = [];
  const meta = { keys: Object.keys(keys) };
  const dbKeys = Object.assign({}, keys, {
    __created: 'timestamp',
    __jsondata: 'string',
  });

  let sql = `CREATE TABLE \`${name}\``;

  Object.keys(dbKeys).forEach(key => {
    let column = `\`${key}\` `;

    if (key === '__jsondata') {
      column += 'TEXT';
    } else if (key === '__created') {
      column += 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP';
    } else if (dbKeys[key] === 'number') {
      column += 'INTEGER';
    } else if (dbKeys[key] === 'timestamp') {
      column += 'TIMESTAMP';
    } else {
      column += 'VARCHAR(255)';
    }

    if (key === 'id') {
      column += ' PRIMARY KEY NOT NULL';
      if (autoincrement) {
        column += ' ' + autoincrement;
      }
    }

    columns.push(column);

    // Index every key except the raw JSON data
    if (key !== '__jsondata') {
      const type = (key === 'id' && 'UNIQUE' || '') + ' INDEX';
      statements.push(`CREATE ${type} \`idx-${name}-${key}\` ON \`${name}\`(\`${key}\`)`);
    }
  });

  // Meta table is used to track keys (instead of querying the schema)
  statements.push(`
    CREATE TABLE IF NOT EXISTS __meta(
      \`id\` INTEGER PRIMARY KEY ${autoincrement || ''},
      \`store\` VARCHAR(255) NOT NULL,
      \`data\` TEXT NOT NULL
    );`
  );

  statements.push(`
    INSERT INTO __meta (\`store\`, \`data\`)
    VALUES('${sanitize(name)}', '${sanitize(JSON.stringify(meta))}');`
  );

  // Finish CREATE TABLE for this store
  sql += '(' + columns.join(', ') + ')';
  statements.unshift(sql);

  // Wrap into transaction
  statements.unshift('BEGIN');
  statements.push('COMMIT');

  return statements;
};

// Expand criteria into WHERE clause
const expandCriteria = (criteria, sanitize, params) => {
  if (!criteria) {
    return '';
  }

  criteria = criteria.filter(clause => !!clause.where);

  if (!criteria.length) {
    return '';
  }

  return ' WHERE ' + criteria.map(clause => buildCriteria(clause, sanitize, params)).join(' AND ');
};

// Common handling for (most) errors
const handleError = (error, result, callback) => {
  if (error) {
    result.error = error;
    callback(result);
    return true;
  }

  return false;
};

module.exports = {
  buildCriteria,
  createStore,
  expandCriteria,
  handleError
};
