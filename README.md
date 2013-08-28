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
-- Any properties can exist on an object, but non-keys can't be queried.

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


api.save(object, store, keys, callback) - Save an object to a store
---

Parameters:

- `object` {object} - JSON-serializable object
- `store` {string} - Name of object store
- `keys` {object} - (Optional) set of key/values to override keys from `object`
- `callback` {function} - Called with a `Result` argument

By default, keys on the top-level of `object` will automatically be saved to
their indexed columns in the database (if they were declared in `createStore`).

The optional `keys` parameter is useful for keying/indexing properties that may
not be on the top-level object (e.g. a property in a nested object). It could
also be used to index values that are not in `object` at all.

One key is always required: `id`. When you save your object,
`id` is used to decide if an existing object needs to be updated (instead of
creating a new object). When you want to update an object, simply save with its
`id` key set to the existing value.

If you do not specify `id` in your keys, it will assume `id: 'number'`.

Any time you save an object without an `id`, it will be auto-generated and
placed into your object for you to reference later.

You can specify your own IDs (and you can set `id` to be a `string`). If you
choose to use a non-numeric ID and do not include it in your object, the
database will throw an error about rejecting your NULL ID.

api.get(store, criteria, callback) - Query an object store
---

Parameters:

- `store` {string} - Name of object store
- `criteria` {object | array<object>} - List of criteria (see below)
- `callback` {function} - Called with a `Result` argument

Criteria is an object (or array of objects) that defines what is
essentially a `WHERE` clause in SQL terms.

Each criteria object can have the following properties:

- `where` {string} - The key of the JSON object the criteria is targeting
- `op` {string} - The type of criteria operation (default `eq`). Types are:
-- `=` - equal to
-- `!=` - not equal to
-- `<` - less than
-- `>` - greater than
- Value (of `op`) {string}: The right-hand side of the criteria argument

By default, a list of criteria operates as `AND` to the previous criteria item.
You can pass additional criteria as nested `and` or `or` properties.

As a reminder: only keyed properties of a JSON object can be queried.

Examples:

Find all users of age 20:
`{ where: 'age', '=': 20 }`

Find all users less than age 20:
`{ where: 'age', '<': 20 }`

Find all teenage users less than age 20:

    [
        { where: 'age', '>': '13' },
        { where: 'age', '<': '20' }
    ]

Find all users who are 18 or 21

    { where: 'age', '=': '18', or: {
        where: 'age', '=': '21'
      }
    }

Result objects
===
All callbacks from the database include a `Result` object.
No matter what operation, a `Result` object will always have a boolean
`success` property. Any problems will be logged in an `error` property.

Rows from query operations will be available on the Result's `data` array.
