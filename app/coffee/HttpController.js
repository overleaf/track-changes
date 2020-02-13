/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let HttpController;
const UpdatesManager = require("./UpdatesManager");
const DiffManager = require("./DiffManager");
const PackManager = require("./PackManager");
const RestoreManager = require("./RestoreManager");
const logger = require("logger-sharelatex");
const HealthChecker = require("./HealthChecker");
const _ = require("underscore");

module.exports = (HttpController = {
	flushDoc(req, res, next) {
		if (next == null) { next = function(error) {}; }
		const { doc_id } = req.params;
		const { project_id } = req.params;
		logger.log({project_id, doc_id}, "compressing doc history");
		return UpdatesManager.processUncompressedUpdatesWithLock(project_id, doc_id, function(error) {
			if (error != null) { return next(error); }
			return res.send(204);
		});
	},

	flushProject(req, res, next) {
		if (next == null) { next = function(error) {}; }
		const { project_id } = req.params;
		logger.log({project_id}, "compressing project history");
		return UpdatesManager.processUncompressedUpdatesForProject(project_id, function(error) {
			if (error != null) { return next(error); }
			return res.send(204);
		});
	},

	flushAll(req, res, next) {
		// limit on projects to flush or -1 for all (default)
		if (next == null) { next = function(error) {}; }
		const limit = (req.query.limit != null) ? parseInt(req.query.limit, 10) : -1;
		logger.log({limit}, "flushing all projects");
		return UpdatesManager.flushAll(limit, function(error, result) {
			if (error != null) { return next(error); }
			const {failed, succeeded, all} = result;
			const status = `${succeeded.length} succeeded, ${failed.length} failed`;
			if (limit === 0) {
				return res.status(200).send(`${status}\nwould flush:\n${all.join('\n')}\n`);
			} else if (failed.length > 0) {
				logger.log({failed, succeeded}, "error flushing projects");
				return res.status(500).send(`${status}\nfailed to flush:\n${failed.join('\n')}\n`);
			} else {
				return res.status(200).send(`${status}\nflushed ${succeeded.length} projects of ${all.length}\n`);
			}
		});
	},

	checkDanglingUpdates(req, res, next) {
		if (next == null) { next = function(error) {}; }
		logger.log("checking dangling updates");
		return UpdatesManager.getDanglingUpdates(function(error, result) {
			if (error != null) { return next(error); }
			if (result.length > 0) {
				logger.log({dangling: result}, "found dangling updates");
				return res.status(500).send(`dangling updates:\n${result.join('\n')}\n`);
			} else {
				return res.status(200).send("no dangling updates found\n");
			}
		});
	},

	checkDoc(req, res, next) {
		if (next == null) { next = function(error) {}; }
		const { doc_id } = req.params;
		const { project_id } = req.params;
		logger.log({project_id, doc_id}, "checking doc history");
		return DiffManager.getDocumentBeforeVersion(project_id, doc_id, 1, function(error, document, rewoundUpdates) {
			if (error != null) { return next(error); }
			const broken = [];
			for (let update of Array.from(rewoundUpdates)) {
				for (let op of Array.from(update.op)) {
					if (op.broken === true) {
						broken.push(op);
					}
				}
			}
			if (broken.length > 0) {
				return res.send(broken);
			} else {
				return res.send(204);
			}
		});
	},

	getDiff(req, res, next) {
		let from, to;
		if (next == null) { next = function(error) {}; }
		const { doc_id } = req.params;
		const { project_id } = req.params;

		if (req.query.from != null) {
			from = parseInt(req.query.from, 10);
		} else {
			from = null;
		}
		if (req.query.to != null) {
			to = parseInt(req.query.to, 10);
		} else {
			to = null;
		}

		logger.log({project_id, doc_id, from, to}, "getting diff");
		return DiffManager.getDiff(project_id, doc_id, from, to, function(error, diff) {
			if (error != null) { return next(error); }
			return res.json({diff});
	});
	},

	getUpdates(req, res, next) {
		let before, min_count;
		if (next == null) { next = function(error) {}; }
		const { project_id } = req.params;

		if (req.query.before != null) {
			before = parseInt(req.query.before, 10);
		}
		if (req.query.min_count != null) {
			min_count = parseInt(req.query.min_count, 10);
		}

		return UpdatesManager.getSummarizedProjectUpdates(project_id, {before, min_count}, function(error, updates, nextBeforeTimestamp) {
			if (error != null) { return next(error); }
			return res.json({
				updates,
				nextBeforeTimestamp
			});
	});
	},

	restore(req, res, next) {
		if (next == null) { next = function(error) {}; }
		let {doc_id, project_id, version} = req.params;
		const user_id = req.headers["x-user-id"];
		version = parseInt(version, 10);
		return RestoreManager.restoreToBeforeVersion(project_id, doc_id, version, user_id, function(error) {
			if (error != null) { return next(error); }
			return res.send(204);
		});
	},

	pushDocHistory(req, res, next) {
		if (next == null) { next = function(error) {}; }
		const { project_id } = req.params;
		const { doc_id } = req.params;
		logger.log({project_id, doc_id}, "pushing all finalised changes to s3");
		return PackManager.pushOldPacks(project_id, doc_id, function(error) {
			if (error != null) { return next(error); }
			return res.send(204);
		});
	},

	pullDocHistory(req, res, next) {
		if (next == null) { next = function(error) {}; }
		const { project_id } = req.params;
		const { doc_id } = req.params;
		logger.log({project_id, doc_id}, "pulling all packs from s3");
		return PackManager.pullOldPacks(project_id, doc_id, function(error) {
			if (error != null) { return next(error); }
			return res.send(204);
		});
	},

	healthCheck(req, res){
		return HealthChecker.check(function(err){
			if (err != null) {
				logger.err({err}, "error performing health check");
				return res.send(500);
			} else {
				return res.send(200);
			}
		});
	},

	checkLock(req, res){
		return HealthChecker.checkLock(function(err) {
			if (err != null) {
				logger.err({err}, "error performing lock check");
				return res.send(500);
			} else {
				return res.send(200);
			}
		});
	}
});
