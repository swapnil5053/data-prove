/**
 * MongoDB Replica Set Initialization Script
 * Runs automatically on first container startup via docker-entrypoint-initdb.d
 *
 * WHY REPLICA SET?
 *   MongoDB requires a replica set (even a single-node one) to support
 *   multi-document ACID transactions (sessions). Without this, our
 *   atomic registerDataset() and updateDataset() functions will throw:
 *   "Transaction numbers are only allowed on a replica set member or mongos"
 */
rs.initiate({
  _id: 'rs0',
  members: [{ _id: 0, host: 'mongodb:27017' }],
});
