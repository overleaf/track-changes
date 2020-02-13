/* eslint-disable
    handle-callback-err,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const sinon = require("sinon");
const chai = require("chai");
chai.should();
const { expect } = chai;
const mongojs = require("../../../app/js/mongojs");
const { ObjectId } = mongojs;
const Settings = require("settings-sharelatex");
const LockManager = require("../../../app/js/LockManager");
const rclient = require("redis").createClient(Settings.redis.history); // Only works locally for now
const TrackChangesApp = require("./helpers/TrackChangesApp");

describe("Locking document", function() {

	before(function(done){
		TrackChangesApp.ensureRunning(done);
		return null;
	});
		
	return describe("when the lock has expired in redis", function() {
		before(function(done) {
			LockManager.LOCK_TTL = 1; // second
			LockManager.runWithLock("doc123", releaseA => {
				// we create a lock A and allow it to expire in redis
				return setTimeout(() =>
					// now we create a new lock B and try to release A
					LockManager.runWithLock("doc123", releaseB => {
						return releaseA();
					}  // try to release lock A to see if it wipes out lock B
					, (error) => {})
				
						// we never release lock B so nothing should happen here
				, 1500);
			} // enough time to wait until the lock has expired
			, error =>
				// we get here after trying to release lock A
				done()
			);
			return null;
		});

		return it("the new lock should not be removed by the expired locker", function(done) {
			LockManager.checkLock("doc123", (err, isFree) => {
					expect(isFree).to.equal(false);
					return done();
			});
			return null;
		});
	});
});
