/* eslint-disable
    camelcase,
    handle-callback-err,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let WebApiManager;
const request = require("requestretry");  // allow retry on error https://github.com/FGRibreau/node-request-retry
const logger = require("logger-sharelatex");
const Settings = require("settings-sharelatex");

// Don't let HTTP calls hang for a long time
const MAX_HTTP_REQUEST_LENGTH = 15000; // 15 seconds

// DEPRECATED! This method of getting user details via track-changes is deprecated
// in the way we lay out our services.
// Instead, web should be responsible for collecting the raw data (user_ids) and
// filling it out with calls to other services. All API calls should create a
// tree-like structure as much as possible, with web as the root.
module.exports = (WebApiManager = {
	sendRequest(url, callback) {
		if (callback == null) { callback = function(error, body) {}; }
		return request.get({
			url: `${Settings.apis.web.url}${url}`,
			timeout: MAX_HTTP_REQUEST_LENGTH,
			maxAttempts: 2, // for node-request-retry
			auth: {
				user: Settings.apis.web.user,
				pass: Settings.apis.web.pass,
				sendImmediately: true
			}
		}, function(error, res, body){
			if (error != null) {
				return callback(error);
			}
			if (res.statusCode === 404) {
				logger.log({url}, "got 404 from web api");
				return callback(null, null);
			}
			if ((res.statusCode >= 200) && (res.statusCode < 300)) {
				return callback(null, body);
			} else {
				error = new Error(`web returned a non-success status code: ${res.statusCode} (attempts: ${res.attempts})`);
				return callback(error);
			}
		});
	},

	getUserInfo(user_id, callback) {
		if (callback == null) { callback = function(error, userInfo) {}; }
		const url = `/user/${user_id}/personal_info`;
		logger.log({user_id}, "getting user info from web");
		return WebApiManager.sendRequest(url, function(error, body) {
			let user;
			if (error != null) {
				logger.error({err: error, user_id, url}, "error accessing web");
				return callback(error);
			}

			if (body === null) {
				logger.error({user_id, url}, "no user found");
				return callback(null, null);
			}
			try {
				user = JSON.parse(body);
			} catch (error1) {
				error = error1;
				return callback(error);
			}
			return callback(null, {
				id: user.id,
				email: user.email,
				first_name: user.first_name,
				last_name: user.last_name
			});
	});
	},

	getProjectDetails(project_id, callback) {
		if (callback == null) { callback = function(error, details) {}; }
		const url = `/project/${project_id}/details`;
		logger.log({project_id}, "getting project details from web");
		return WebApiManager.sendRequest(url, function(error, body) {
			let project;
			if (error != null) {
				logger.error({err: error, project_id, url}, "error accessing web");
				return callback(error);
			}

			try {
				project = JSON.parse(body);
			} catch (error1) {
				error = error1;
				return callback(error);
			}
			return callback(null, project);
		});
	}
});
