/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const { ObjectId } = require("mongojs");
const request = require("request");
const async = require("async");
const settings = require("settings-sharelatex");
const { port } = settings.internal.trackchanges;
const logger = require("logger-sharelatex");
const LockManager = require("./LockManager");

module.exports = {
	check(callback){
		const project_id = ObjectId(settings.trackchanges.healthCheck.project_id);
		const url = `http://localhost:${port}/project/${project_id}`;
		logger.log({project_id}, "running health check");
		const jobs = [
			cb=>
				request.get({url:`http://localhost:${port}/check_lock`, timeout:3000}, function(err, res, body) {
					if (err != null) {
						logger.err({err, project_id}, "error checking lock for health check");
						return cb(err);
					} else if ((res != null ? res.statusCode : undefined) !== 200) {
						return cb(`status code not 200, it's ${res.statusCode}`);
					} else {
						return cb();
					}
				})
			,
			cb=>
				request.post({url:`${url}/flush`, timeout:10000}, function(err, res, body) {
					if (err != null) {
						logger.err({err, project_id}, "error flushing for health check");
						return cb(err);
					} else if ((res != null ? res.statusCode : undefined) !== 204) {
						return cb(`status code not 204, it's ${res.statusCode}`);
					} else {
						return cb();
					}
				})
			,
			cb=>
				request.get({url:`${url}/updates`, timeout:10000}, function(err, res, body){
					if (err != null) {
						logger.err({err, project_id}, "error getting updates for health check");
						return cb(err);
					} else if ((res != null ? res.statusCode : undefined) !== 200) {
						return cb(`status code not 200, it's ${res.statusCode}`);
					} else {
						return cb();
					}
				})
			
		];
		return async.series(jobs, callback);
	},

	checkLock(callback) {
		return LockManager.healthCheck(callback);
	}
};
