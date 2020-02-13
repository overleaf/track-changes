/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let MongoManager;
const {db, ObjectId} = require("./mongojs");
const PackManager = require("./PackManager");
const async = require("async");
const _ = require("underscore");
const metrics = require('metrics-sharelatex');
const logger = require('logger-sharelatex');

module.exports = (MongoManager = {
	getLastCompressedUpdate(doc_id, callback) {
		if (callback == null) { callback = function(error, update) {}; }
		return db.docHistory
			.find({doc_id: ObjectId(doc_id.toString())}, {pack: {$slice:-1}}) // only return the last entry in a pack
			.sort({ v: -1 })
			.limit(1)
			.toArray(function(error, compressedUpdates) {
				if (error != null) { return callback(error); }
				return callback(null, compressedUpdates[0] || null);
		});
	},

	peekLastCompressedUpdate(doc_id, callback) {
		// under normal use we pass back the last update as
		// callback(null,update,version).
		//
		// when we have an existing last update but want to force a new one
		// to start, we pass it back as callback(null,null,version), just
		// giving the version so we can check consistency.
		if (callback == null) { callback = function(error, update, version) {}; }
		return MongoManager.getLastCompressedUpdate(doc_id, function(error, update) {
			if (error != null) { return callback(error); }
			if (update != null) {
				if (update.broken) { // marked as broken so we will force a new op
					return callback(null, null);
				} else if (update.pack != null) {
					if (update.finalised) { // no more ops can be appended
						return callback(null, null, update.pack[0] != null ? update.pack[0].v : undefined);
					} else {
						return callback(null, update, update.pack[0] != null ? update.pack[0].v : undefined);
					}
				} else {
					return callback(null, update, update.v);
				}
			} else {
				return PackManager.getLastPackFromIndex(doc_id, function(error, pack) {
					if (error != null) { return callback(error); }
					if (((pack != null ? pack.inS3 : undefined) != null) && ((pack != null ? pack.v_end : undefined) != null)) { return callback(null, null, pack.v_end); }
					return callback(null, null);
				});
			}
		});
	},

	backportProjectId(project_id, doc_id, callback) {
		if (callback == null) { callback = function(error) {}; }
		return db.docHistory.update({
			doc_id: ObjectId(doc_id.toString()),
			project_id: { $exists: false }
		}, {
			$set: { project_id: ObjectId(project_id.toString()) }
		}, {
			multi: true
		}, callback);
	},

	getProjectMetaData(project_id, callback) {
		if (callback == null) { callback = function(error, metadata) {}; }
		return db.projectHistoryMetaData.find({
			project_id: ObjectId(project_id.toString())
		}, function(error, results) {
			if (error != null) { return callback(error); }
			return callback(null, results[0]);
	});
	},

	setProjectMetaData(project_id, metadata, callback) {
		if (callback == null) { callback = function(error) {}; }
		return db.projectHistoryMetaData.update({
			project_id: ObjectId(project_id)
		}, {
			$set: metadata
		}, {
			upsert: true
		}, callback);
	},

	upgradeHistory(project_id, callback) {
		// preserve the project's existing history
		if (callback == null) { callback = function(error) {}; }
		return db.docHistory.update({
			project_id: ObjectId(project_id),
			temporary: true,
			expiresAt: {$exists: true}
		}, {
			$set: {temporary: false},
			$unset: {expiresAt: ""}
		}, {
			multi: true
		}, callback);
	},

	ensureIndices() {
		// For finding all updates that go into a diff for a doc
		db.docHistory.ensureIndex({ doc_id: 1, v: 1 }, { background: true });
		// For finding all updates that affect a project
		db.docHistory.ensureIndex({ project_id: 1, "meta.end_ts": 1 }, { background: true });
		// For finding updates that don't yet have a project_id and need it inserting
		db.docHistory.ensureIndex({ doc_id: 1, project_id: 1 }, { background: true });
		// For finding project meta-data
		db.projectHistoryMetaData.ensureIndex({ project_id: 1 }, { background: true });
		// TTL index for auto deleting week old temporary ops
		db.docHistory.ensureIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true });
		// For finding packs to be checked for archiving
		db.docHistory.ensureIndex({ last_checked: 1 }, { background: true });
		// For finding archived packs
		return db.docHistoryIndex.ensureIndex({ project_id: 1 }, { background: true });
	}
});


[
	'getLastCompressedUpdate',
	'getProjectMetaData',
	'setProjectMetaData'
].map(method => metrics.timeAsyncMethod(MongoManager, method, 'mongo.MongoManager', logger));
