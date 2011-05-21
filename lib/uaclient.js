var net = require('net'),
    sys = require('sys'),
    events = require('events'),
    edf = require('edfparser'),
    profiler = require('profiler');

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

function cache_user_list(tree) {
    var users = tree.children;
    log.info("caching user list, "+users.length+" exist");
    for(var i in users) {
        var user = users[i];
        if (user.tag == 'user') { // not all EDF children are useful
            var id = user.value;
            flatten(user);
//            log.info(user.name+" has ID "+id);
            user_byname[user.name] = user;
        }
    }
}

function cache_folder_list(a, that) {
//    <reply="folder_list"><folder=1><name="test"/><accessmode=7/><subtype=1/><unread=1/></><folder=2><name="private"/><accessmode=263/><subtype=1/></><folder=3><name="chat"/><accessmode=7/><subtype=1/><temp=1/></><numfolders=3/></>
    var f = [];
    var fhash = {};
    for(var i in a.children) {
        var x = a.children[i];
        if (x.children != undefined) {
            flatten(x);
//            sys.puts(sys.inspect(x));
            if (x.subscribed != undefined) {
                f.push(x.name);
                fhash[x.name] = x.value;
            }
        }
    }
    that.folders = f;
    log.info("changing reply_folder_list listener");
    that.active = true;
    that.emit('folders-first', f, fhash);
    that.removeListener('reply_folder_list', cache_folder_list);
    that.addListener("reply_folder_list", function(a){reply_folder_list(a,that)});
}

function reply_folder_list(a, that) {
//    <reply="folder_list"><folder=1><name="test"/><accessmode=7/><subtype=1/><unread=1/></><folder=2><name="private"/><accessmode=263/><subtype=1/></><folder=3><name="chat"/><accessmode=7/><subtype=1/><temp=1/></><numfolders=3/></>
    var f = [];
    var fhash = {};
    for(var i in a.children) {
        var x = a.children[i];
        if (x.children != undefined) {
            flatten(x);
    //        sys.puts(sys.inspect(x));
            if (x.subscribed != undefined) {
                f.push(x.name);
                fhash[x.name] = x.value;
            }
        }
    }
    that.folders = f;
    that.emit('folders', f, fhash);
}

function req_user_list(self) {
    self.request('user_list');
   // stream.write('<request="user_list"/>');
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

    // if we're passed a logger, use that, else use our own
    if (logger == undefined) {
        log = new Log(loglevel);
    } else {
        log = logger;
    }

    // request a user_list when we login ...
    self.addListener("reply_user_login", function(){
        if (1 || self.caching === true) {
//	        setTimeout(function(){ req_user_list(self); }, 4000); // avoid parsing troubles
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
        this.request('user_login', h);
        this.state = 1; // trying to login
    });

    var that = self;

    // cache the user list
    self.addListener("reply_user_login", function(){that.alive = true;});
    self.addListener("reply_user_list", function(a){cache_user_list(a,that)});
    self.addListener("reply_folder_list", function(a){cache_folder_list(a,that)});

    self.addListener("parsed", function(j) {
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
            var method = parsed.trees[i].tag + "_" + parsed.trees[i].value;
            log.info("E "+method);
            that.emit(method, parsed.trees[i]);
        }
    });
    
};
sys.inherits(UAClient, events.EventEmitter);

UAClient.prototype.get_user = function(username) {
    sys.puts("++ wanting "+username);
    return user_byname[username];
}

UAClient.prototype.safestring = function(s) {
    s.replace(/"/g, '\\"');
    return s;
}

UAClient.prototype.flatten = function(q) {
    for(var i=0;i<q.children.length;i++){
        //log.info("H "+q.children[i].tag+" = "+q.children[i].value);
        q[q.children[i].tag] = q.children[i].value};
}


UAClient.prototype.page = function(to, text) {
    var edf = "<request=\"user_contact\"><toid="+to+"/><text=\""+this.safestring(text)+"\"/></>";
    log.info("> "+edf);
    this.stream.write(edf);
}

UAClient.prototype.hashtoedf = function(h) {
    var edf = ""
    for(var i in h) {
        if (parseInt(h[i]) === h[i]) { // a number
            edf = edf + "<"+i+"="+h[i]+"/>";
        } else {
            // probably should escape h[i] with safestring here
            edf = edf + "<"+i+'="'+h[i]+'"/>';
        }
    }
    return edf;
}

UAClient.prototype.request = function(type, hash) {
    var a;
    if (hash == undefined) {
        a = '<request="'+type+'"/>';
    } else {
        a = '<request="'+type+'">'+this.hashtoedf(hash)+"</>";
    }
    log.info("> !"+this.username+" "+a);
    if (this.stream != undefined) {
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
    log.info(x);
    return flatten(x);
}

UAClient.prototype.req_folder_list = function(self) {
    self.request('folder_list', {searchtype: 0});
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
    log.info("+S "+this.stream);
    
    var that = this;

    this.stream.addListener("connect", function() {
        log.info("+ connected.");
        log.info("!S "+that.stream);
        log.info("sending EDF on");
        that.stream.write("<edf=\"on\"/>");
    });
    
    this.stream.addListener("data", function(data) {
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
