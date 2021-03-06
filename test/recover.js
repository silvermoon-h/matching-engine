// set timestamps to be fake timestamps
require('bitfloor/time').use_test_timestamps();

var net = require('net');
var fs = require('fs');
var dgram = require('dgram');
var exec = require('child_process').exec;

var logger = require('bitfloor/logger');
var Messenger = require('bitfloor/messenger');

var Matcher = require('../');
var json2 = require('../deps/json2'); // for pretty-serialize

var BASE_DIR = __dirname + "/recover";
var TIMEOUT = 100;

var env = require('bitfloor/config').env;

logger.silence(0);

var matcher_config = {
    client: {
        ip: 'localhost',
        port: 10001
    },
    feed: {
        ip: '239.255.0.1',
        port: 10001
    }
};

// create the matcher used for testing
var product_id = 0; // fake id, matcher doesn't care except to save state
var matcher = new Matcher(product_id, matcher_config);

function clear_log_dir(cb) {
    exec("rm -rf " + env.logdir + "/*", function(error) {
        if (error) {
            console.log('ERROR:');
            console.log(error);
            process.exit(1);
        }
        cb();
    });
}

function clear_state_dir(cb) {
    exec("rm -rf " + env.statedir + "/*", function(error) {
        if (error) {
            console.log('ERROR:');
            console.log(error);
            process.exit(1);
        }
        cb();
    });
}

function clear_journal_dir(cb) {
    exec("rm -rf " + env.journaldir + "/*", function(error) {
        if (error) {
            console.log('ERROR:');
            console.log(error);
            process.exit(1);
        }
        cb();
    });
}

function do_test(test_name, assert, cb) {
    clear_log_dir(function() {
        clear_state_dir(function() {
            clear_journal_dir(function() {
                // reset matcher state
                matcher.reset();

                matcher.start(function() {
                    run_test(test_name, assert, cb);
                });
            });
        });
    });
}

function run_test(test_name, assert, cb) {
    var test_file = BASE_DIR + "/" + test_name;
    var orders = JSON.parse(fs.readFileSync(test_file));

    var client = net.createConnection(matcher_config.client.port);

    client.on('connect', function() {
        var ms = new Messenger(client);

        orders.forEach(function(order) {
            ms.send(order);
        });

        // TODO: jenky
        setTimeout(function() {
            client.end();
            run_recover(assert, cb);
        }, 100);
    });
}

function run_recover(assert, cb) {
    var gold_state = matcher.state();

    // increment state num because it is incremented when writing state to state file
    gold_state.state_num++; // TODO: jenky, because of a jenky thing in the matcher

    // stops the matcher and tries to have it startup again and read the old state
    matcher.stop(function() {
        matcher.reset();
        matcher.start(function() {
            var state = matcher.state();
            assert.deepEqual(state, gold_state);
            matcher.stop(cb);
        });
    });
}

function process_tests(tests) {
    function make_test(name) {
        return function(assert) {
            do_test(name, assert, function(ret) {
                assert.done();
            });
        }
    }

    var test_name;
    while (test_name = tests.shift()) {
        // skip hidden files
        if(test_name[0] === '.') {
            continue;
        }

        module.exports[test_name] = make_test(test_name);
    }
}

var tests = fs.readdirSync(BASE_DIR);
process_tests(tests);
