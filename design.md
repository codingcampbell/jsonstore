Design summary:
===
The database will be a basic key/value store with multiple keys.
These keys are basically a selective schema. The JSON object (stored as a TEXT)
can have any properties, but the keys are mapped to indexed columns on a table 
for fast lookups and joins.

Requirements:
===
- The database will be based on SQLite.
- It will be focused specifically on storing JSON-serializable objects.
- It will be stored as key/value with multiple keys per value.

- Tables will be created for each "Store" (user-facing "container" object).
-- The table's schema will include columns for each "keyed" attribute.
-- Keys are required properties in the JSON object being stored.
-- Other properties can exist, but non-keys can't be queried.

- The database will track time information for each object for fast query ops:
-- Creation time
-- Modified time

API rough draft
====

api.createStore(name, keys, callback) - Create a 'store' (collection of objects)
---

Parameters:

- `name` {string} - Name of store (maps to table name)
- `keys` {object} - Set of name/type. Type can be `number` or `string` (default)
-- E.g. `{ id: 'number', name: 'string' }`
- `callback` {function} - Called with a `Result`


api.save(object, store) - Save an object to a store
---

Parameters:

- `object` {object} - JSON-serializable object
- `store` {string} - Name of object store
- `callback` {function} - Called with a `Result` argument

api.query(store, criteria, callback) - Query an object store
---

Parameters:

- `store` {string} - Name of object store
- `criteria` {object | array<object>} - List of criteria (see below)
- `callback` {function} - Called with a `Result` argument

Criteria is an object (or array of objects) that defines what is
essentially a `WHERE` clause in SQL terms.

Each criteria object can have the following properties:

- `key` {string} - The key of the JSON object the criteria is targeting
- `op` {string} - The type of criteria operation (default `eq`). Types are:
-- `eq` - equal to
-- `ne` - not equal to
-- `lt` - less than
-- `gt` - greater than
- `or` {boolean} - Optional, default `false`, specifies conditional logic
- Value {string}: The right-hand side of the criteria argument

By default, a list of criteria operates as `AND` to the previous criteria item.
Passing `or: true` in a criteria item will flip this logic.
This design does not account for grouping of AND/OR comparisons.

As a reminder: only keyed properties of a JSON object can be queried.

Examples:

Find all users of age 20:
`{ key: 'age', value: '20'}`

Find all users less than age 20:
`{ key: 'age', op: 'lt', value: '20'}`

Find all teenage users less than age 20:

    [
        { key: 'age', op: 'gt', value: '13' }
        { key: 'age', op: 'lt', value: '20' }
    ]

Find all users who are 18 or 21

    [
        { key: 'age', value: '18' }
        { or: true, key: 'age', value: '21' }
    ]

Result objects
===
All callbacks from the database include a `Result` object.
No matter what operation, a `Result` object will always have a boolean
`success` property. Any problems will be logged in an `error` property.

Query operations will numerically index each object on `Result` itself.
You can check the `length` property to iterate.
