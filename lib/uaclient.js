var net = require('net'),
    sys = require('sys'),
    events = require('events'),
    edf = require('edfparser'),
    profiler = require('profiler'),
    util = require('util');

var Log = require('log');
var loglevel = process.env['UACLIENT_LEVEL'] || 'warning';
var log; // annoyingly global

var user_byname = new Array();

function flatten(q, prefix) {
    for(var i in q.children) {
        if (q.children.hasOwnProperty(i)) {
	        if (prefix == undefined) {
	            q[q.children[i].tag] = q.children[i].value
	        } else {
	            q[prefix + q.children[i].tag] = q.children[i].value
	        }
        }
    };
    return q;
}

function UAClient(logger) {
    events.EventEmitter.call(this);
    var self = this;
    self.stream = undefined;
    self.state = undefined;
    self.username = undefined;
    self.password = undefined;
    self.shadow = undefined;
    self.alive = false;
    self.exit_on_end = true;
    self.caching = true;
    self.active = undefined;
    self.response_queues = [];

    self.header_cache = [];

    var now = new Date().getTime();
    self.last_activity = now;

    // if we're passed a logger, use that, else use our own
    if (logger == undefined) {
        log = new Log(loglevel);
    } else {
        log = logger;
    }

    // request a user_list when we login ...
    self.addListener("reply_user_login", function(){
        if (self.caching === true) {
	        setTimeout(function(){ self.req_user_list(self, self.cache_user_list); }, 4000); // avoid parsing troubles
	        setTimeout(function(){ self.req_folder_list(self); self.emit("uaclient_login"); }, 2000); // also
        }
    });
    // ... then every 15 minutes after this
    setInterval(function(){
        if (self.caching === true) { 
 //           req_user_list(self)
        }}
    , 900000);
    setInterval(function(){
        if (self.caching === true) {
            req_folder_list(self)
        }}
    , 902000);

    // try to login
    self.addListener("edf_on", function() {
        var h = { 
            name: this.username, password: this.password
        };
        if (this.shadow != undefined) {
            h.status = 256;
            h.shadow = 256;
        }
        log.info(this.hashtoedf(h));
        this.request('user_login', h, function(t, a){
            if (t == 'user_login') {
                self.emit('reply_user_login');
            } else {
                self.emit('abort');
                self.emit('reply_user_login_invalid');
                sys.puts("invalid login, aborting");
            }
        });
        this.state = 1; // trying to login
    });

    var that = self;

    // cache the user list
    self.addListener("reply_user_login", function(){that.alive = true;});

    self.addListener("parsed", function(j) {
        self.last_activity = new Date().getTime();

        // remove \r and escape \n
        var q1 = j.replace(/\r/g, ' ');
        j = q1.replace(/\n/g, '\\n');

        try {
            profiler.gc(); // JSON.parse seems to like heap
            parsed = JSON.parse(j);
        } catch(e) {
            log.critical("parsed: "+e);
            throw(e); // bounce this upwards
        }
        for(var i=0; i<parsed.parsed; i++) {
            var parse_type = parsed.trees[i].tag;
            var parse_subtype = parsed.trees[i].value;
            var method = parse_type + "_" + parse_subtype;
            log.info("E "+method);
            // if method is reply, we've previously made a request
            // look in the queues for this
            if (parse_type === 'reply') {
                //sys.puts(sys.inspect(that.response_queues));
                callback = that.response_queues.shift();
                //sys.puts(sys.inspect(that.response_queues));
                //sys.puts("found a callback for "+parse_subtype+" "+callback)
                if (callback !== undefined) {
                    callback(parse_subtype, parsed.trees[i]);
                }
            } else {
                that.emit(method, parsed.trees[i]);
            }
        }
    });
    
};

sys.inherits(UAClient, events.EventEmitter);

UAClient.prototype.cache_folder_list = function(a, that) {
//    <reply="folder_list"><folder=1><name="test"/><accessmode=7/><subtype=1/><unread=1/></><folder=2><name="private"/><accessmode=263/><subtype=1/></><folder=3><name="chat"/><accessmode=7/><subtype=1/><temp=1/></><numfolders=3/></>
    var f = [];
    var fhash = {};
    var flat = this.recursive_flatten(a);
    for(var i in flat) {
        var x = flat[i];
        flatten(x);
        f.push(x.name);
        fhash[x.name] = x.value;
        fhash[x.name.toLowerCase()] = x.value;
    }
    f.sort();
    this.folders = fhash;
    this.emit('folder-cache', f, fhash);
}

UAClient.prototype.get_user = function(username) {
    return user_byname[username];
}

function safestring(s) {
    return s.replace(/"/g, '\\"');
}

UAClient.prototype.safestring = function(s) {
    s.replace(/"/g, '\\"');
    return s;
}

UAClient.prototype.recursive_flatten = function(q, depth, defvar) {
    var retvals = [];
    for(var i in q.children) {
        var item = q.children[i];
        if (q.children.hasOwnProperty(i)) {
            if (item.tag == 'message' || item.tag == 'folder') {
                flatten(item);
                if (item['replyto']) {
                    for (var j in item.children) {
                        var c = item.children[j];
                        flatten(c);
                        if (c.tag == 'replyto') {
                            if (item.inReplyToHierarchy === undefined) {
                                item.inReplyToHierarchy = [];
                            }
                            item.inReplyToHierarchy.push({"id": c.value, "from":c.fromname, "folder": c.foldername||defvar});
                        }
                    }
                }
                if (item['replyby']) {
                    for (var j in item.children) {
                        var c = item.children[j];
                        flatten(c);
                        if (c.tag == 'replyby') {
                            if (item.replyToBy === undefined) {
                                item.replyToBy = [];
                            }
                            item.replyToBy.push({id: c.value, from: c.fromname, folder: c.foldername||defvar});
                        }
                    }
                }

                if (item[item.tag] == undefined) {
                    delete item.children;
                    retvals.push(item);
                } else {
                    var y = item;
                    var x = this.recursive_flatten(item, item.value, defvar);
                    delete y['children'];
                    y.children = undefined;
                    retvals.push(y);
                    // FIXME check if this is the right approach
                    for(var i in x) {
                        x[i].inReplyTo = y.value;
                    }
                    retvals = retvals.concat(x);
                }
            }
        }
    }
    return retvals;
}

UAClient.prototype.flatten = function(q) {
    for(var i in q.children) {
        var item = q.children[i];
        if (q.children.hasOwnProperty(i)) {
        //log.info("H "+q.children[i].tag+" = "+q.children[i].value);
            q[q.children[i].tag] = q.children[i].value;
        }
    }
}


UAClient.prototype.page = function(to, text) {
    var edf = "<request=\"user_contact\"><toid="+to+"/><text=\""+this.safestring(text)+"\"/></>";
    log.info("> "+edf);
    this.stream.write(edf);
}

UAClient.prototype.hashtoedf = function(h) {
    var edf = ""
    for(var i in h) {
        if (h.hasOwnProperty(i)) {
        if (parseInt(h[i], 10) === h[i]) { // a number
            edf = edf + "<"+i+"="+h[i]+"/>";
        } else {
            // probably should escape h[i] with safestring here
            edf = edf + "<"+i+'="'+safestring(h[i])+'"/>';
        }
        }
    }
    return edf;
}

UAClient.prototype.request = function(type, hash, callback) {
    this.last_activity = new Date().getTime();
    var a;
    if (hash == undefined) {
        a = '<request="'+type+'"/>';
    } else {
        a = '<request="'+type+'">'+this.hashtoedf(hash)+"</>";
    }
    if (this.stream != undefined) {
        this.response_queues.push(callback);
        this.stream.write(a);
    }
}

UAClient.prototype.getChild = function(edf, name) {
    var x = undefined;
    for(var i in edf.children) {
        if (edf.children[i].tag == name) {
            x = edf.children[i];
            break;
        }
    }
    return flatten(x);
}

UAClient.prototype.cache_user_list = function(type, tree) {
    var users = tree.children;
    //log.info("caching user list, "+users.length+" exist");
    for(var i in users) {
        var user = users[i];
        if (user.tag == 'user') { // not all EDF children are useful
            var id = user.value;
            flatten(user);
        //    log.info(user.name+" has ID "+id);
            user_byname[user.name] = user;
        }
    }
}

UAClient.prototype.req_user_list = function(self, callback) {
    // I think "self" here is wrong and not strictly necessary
    self.request('user_list', {}, function(t, a) {
        self.cache_user_list(t, a);
        // we use a callback for the first time but rarely again
        if (callback !== undefined) {
            callback();
        }
    });
}

UAClient.prototype.req_folder_list = function(self, callback) {
    // I think "self" here is wrong and not strictly necessary
    self.request('folder_list', {"searchtype":2}, function(t, a) {
        self.cache_folder_list(a);
        // we use a callback for the first time but rarely again
        if (callback !== undefined) {
            callback();
        }
    });
}

UAClient.prototype.connect = function(user, pass, host, port) {
    this.host = host ? host : 'ua2.org';
    this.port = port ? port : 2020;
    this.username = user;
    this.password = pass;
    this.state = 0;
    log.info("+ connecting to "+this.host+":"+this.port);
    this.stream = net.createConnection(this.port, this.host);
    this.stream.setEncoding('utf8');
    this.accdata = "";
    
    var that = this;

    this.addListener("abort", function() {
        that.stream.end();
    });

    this.stream.addListener("connect", function() {
        log.info("+ connected.");
        that.stream.write("<edf=\"on\"/>");
    });
    
    this.stream.addListener("data", function(data) {
        that.last_activity = new Date().getTime();

//        log.info("< ["+data+"]");
        var s_data = that.accdata+""+data // weirdly, node on fabionudibranch returns data as a character array
        if (s_data.length > 0) {
            profiler.gc();
            var j = edf.parse(s_data);
            if (j == 0) {
                sys.exit();
            }
            if (j[0] == '{') { // parsing worked, let's get on with it
                that.accdata = ""; // wipe the accumulation buffer
            //    log.info("parsed ok, sending event with "+j.length+" bytes");
                // log.info(j);
                that.emit('edfstats', s_data.length, j.length);
                that.emit('parsed', j);
            } else {
                that.accdata = s_data; // save it for next time
            }
        }
    });

    this.stream.addListener("close", function(data) {
        log.warning("- disconnected");
        if (that["close"] != undefined) {
            that["close"]();
        }
        that.stream = undefined;
        that.emit('finished', data, 1);
        if (that.exit_on_end === true) {
            process.exit(1);
        }
    });
    this.stream.addListener("end", function(data) {
        log.warning("- ended");
        if (that["close"] != undefined) {
            that["close"]();
        }
        that.stream = undefined;
        that.emit('finished', data, 2);
        if (that.exit_on_end === true) {
            process.exit(2);
        }
    });
    this.stream.addListener("error", function(data) {
        log.critical("- stream error");
        that.stream = undefined;
        that.emit('finished', data, 3);
        // FIXME should exit_on_end be a function? might work better
        if (that.exit_on_end === true) {
            process.exit(3);
        }
    });
};

exports.UAClient = UAClient;
