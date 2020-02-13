/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const Metrics = require("metrics-sharelatex");
Metrics.initialize("track-changes");
const Settings = require("settings-sharelatex");
const logger = require("logger-sharelatex");
const TrackChangesLogger = logger.initialize("track-changes").logger;

if ((Settings.sentry != null ? Settings.sentry.dsn : undefined) != null) {
	logger.initializeErrorReporting(Settings.sentry.dsn);
}

// log updates as truncated strings
const truncateFn = updates =>
		JSON.parse(
			JSON.stringify(updates, function(key, value) {
				let len;
				if ((typeof value === 'string') && ((len = value.length) > 80)) {
					return value.substr(0,32) + `...(message of length ${len} truncated)...` + value.substr(-32);
				} else {
					return value;
				}
		})
		)
	;

TrackChangesLogger.addSerializers({
	rawUpdate: truncateFn,
	rawUpdates: truncateFn,
	newUpdates: truncateFn,
	lastUpdate: truncateFn
});

const Path = require("path");

Metrics.memory.monitor(logger);

const child_process = require("child_process");

const HttpController = require("./app/js/HttpController");
const express = require("express");
const app = express();

app.use(Metrics.http.monitor(logger));

Metrics.injectMetricsRoute(app);

app.post("/project/:project_id/doc/:doc_id/flush", HttpController.flushDoc);

app.get("/project/:project_id/doc/:doc_id/diff", HttpController.getDiff);

app.get("/project/:project_id/doc/:doc_id/check", HttpController.checkDoc);

app.get("/project/:project_id/updates", HttpController.getUpdates);

app.post("/project/:project_id/flush", HttpController.flushProject);

app.post("/project/:project_id/doc/:doc_id/version/:version/restore", HttpController.restore);

app.post('/project/:project_id/doc/:doc_id/push', HttpController.pushDocHistory);
app.post('/project/:project_id/doc/:doc_id/pull', HttpController.pullDocHistory);

app.post('/flush/all', HttpController.flushAll);
app.post('/check/dangling', HttpController.checkDanglingUpdates);

let packWorker = null; // use a single packing worker

app.post("/pack", function(req, res, next) {
	if (packWorker != null) {
		return res.send("pack already running");
	} else {
		logger.log("running pack");
		packWorker = child_process.fork(__dirname + '/app/js/PackWorker.js',
			[req.query.limit || 1000, req.query.delay || 1000, req.query.timeout || (30*60*1000)]);
		packWorker.on('exit', function(code, signal) {
			logger.log({code, signal}, "history auto pack exited");
			return packWorker = null;
		});
		return res.send("pack started");
	}
});

app.get("/status", (req, res, next) => res.send("track-changes is alive"));

app.get("/oops", function(req, res, next) {
	throw new Error("dummy test error");
});

app.get("/check_lock", HttpController.checkLock);

app.get("/health_check",  HttpController.healthCheck);

app.use(function(error, req, res, next) {
	logger.error({err: error, req}, "an internal error occured");
	return res.send(500);
});

const port = __guard__(Settings.internal != null ? Settings.internal.trackchanges : undefined, x => x.port) || 3015;
const host = __guard__(Settings.internal != null ? Settings.internal.trackchanges : undefined, x1 => x1.host) || "localhost";

if (!module.parent) { // Called directly
	app.listen(port, host, function(error) {
		if (error != null) {
			return logger.error({err: error}, "could not start track-changes server");
		} else {
			return logger.info(`trackchanges starting up, listening on ${host}:${port}`);
		}
	});
}

module.exports = app;


function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}