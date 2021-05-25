/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const Settings = require("settings-sharelatex");
const logger = require("logger-sharelatex");
const TrackChangesLogger = logger.initialize("track-changes").logger;
const async = require("async");
const fs = require("fs");
const request = require("request");
const cli = require("cli");

const mongojs = require("mongojs");
const bson = require("bson");
const db = mongojs(Settings.mongo.url, ["docs"]);
const {
    ObjectId
} = mongojs;

const options = cli.parse({
	port: ['p', 'port number for track changes', 'number'],
	force: ['f', 'actually make the fix']
});

if (cli.args.length < 1) {
	console.log("fixdangling -p PORT file_of_doc_ids");
	process.exit();
}

const file = cli.args.pop();
const doc_ids = fs.readFileSync(file).toString().trim().split("\n");

let missing = 0;
let errored = 0;
let success = 0;

const fixDangling = (doc_id, callback) => // look up project id from doc id
db.docs.find({_id:ObjectId(doc_id)}, {project_id:1}, function(err, result) {
    //console.log "doc_id", doc_id, "err", err, "result", result
    if (err != null) {
        errored++;
        return callback();
    }
    if ((result == null) || (result.length === 0)) {
        missing++;
        return callback();
    }
    const {
        project_id
    } = result[0];
    console.log("found project_id", project_id, "for doc_id", doc_id);
    const url = `http://localhost:${options.port}/project/${project_id}/doc/${doc_id}/flush`;
    if (options.force) {
        return request.post(url, function(err, response, body) {
            if (err != null) { errored++; } else { success++; }
            return callback();
        });
    } else {
        console.log("URL:", url);
        success++;
        return callback();
    }
});

async.eachSeries(doc_ids, fixDangling, function(err) {
	console.log("final result", err, "missing", missing, "errored", errored, "success", success);
	return db.close();
});
