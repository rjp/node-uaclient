var net = require('net'),
    sys = require('sys'),
    events = require('events'),
    edf = require('edfparser');

user_byname = new Array();

function flatten(q) {
    for(i=0;i<q.children.length;i++){
//      sys.puts("H "+q.children[i].tag+" = "+q.children[i].value);
        q[q.children[i].tag] = q.children[i].value
    };
    return q;
}

function cache_user_list(tree) {
    var users = tree.children;
    sys.puts("caching user list, "+users.length+" exist");
    for(i in users) {
        var user = users[i];
        if (user.tag == 'user') { // not all EDF children are useful
            var id = user.value;
            flatten(user);
//            sys.puts(user.name+" has ID "+id);
            user_byname[user.name] = user;
        }
    }
}

function req_user_list(self) {
    self.stream.write('<request="user_list"/>');
}

function UAClient() {
    events.EventEmitter.call(this);
    var self = this;
    self.stream = undefined;
    self.state = undefined;
    self.parser = new edf.EDFParser();
    self.username = undefined;
    self.password = undefined;

    // request a user_list when we login and every 5 minutes
    self.addListener("reply_user_login", function(){req_user_list(self)});
    setInterval(function(){req_user_list(self)}, 300000);

    // try to login
	self.addListener("edf_on", function() {
	    this.stream.write("<request=\"user_login\"><name=\""+this.username+"\"/><password=\""+this.password+"\"/></>");
	    this.state = 1; // trying to login
	});
    // cache the user list
    self.addListener("reply_user_list", cache_user_list);

    var that = self;

	self.addListener("parsed", function(j) {
	    parsed = JSON.parse(j);
        for(i=0; i<parsed.parsed; i++) {
		    method = parsed.trees[i].tag + "_" + parsed.trees[i].value;
		    sys.puts("E "+method);
	        that.emit(method, parsed.trees[i]);
        }
	});
	
};
sys.inherits(UAClient, events.EventEmitter);

UAClient.prototype.safestring = function(s) {
    s.replace(/"/g, '\\"');
    return s;
}

UAClient.prototype.flatten = function(q) {
    for(i=0;i<q.children.length;i++){
        //sys.puts("H "+q.children[i].tag+" = "+q.children[i].value);
        q[q.children[i].tag] = q.children[i].value};
}


UAClient.prototype.page = function(to, text) {
    edf = "<request=\"user_contact\"><toid="+to+"/><text=\""+this.safestring(text)+"\"/></>";
    sys.puts("> "+edf);
    this.stream.write(edf);
}

UAClient.prototype.hashtoedf = function(h) {
    edf = ""
    for(i in h) {
        if (parseInt(h[i]) === h[i]) { // a number
            edf = edf + "<"+i+"="+h[i]+"/>";
        } else {
            edf = edf + "<"+i+"='"+h[i]+"'/>";
        }
    }
    return edf;
}

UAClient.prototype.request = function(type, hash) {
    if (hash == undefined) {
        a = '<request="'+type+'"/>';
    } else {
        a = '<request="'+type+'">'+this.hashtoedf(hash)+"</>";
    }
    sys.puts("> "+a);
    if (this.stream != undefined) {
        this.stream.write(a);
    }
}

UAClient.prototype.getChild = function(edf, name) {
    var x = undefined;
    for(i in edf.children) {
        if (edf.children[i].tag == name) {
            x = edf.children[i];
            break;
        }
    }
    sys.puts(x);
    return flatten(x);
}

UAClient.prototype.connect = function(user, pass, host, port) {
    this.host = host ? host : 'ua2.org';
    this.port = port ? port : 2020;
    this.username = user;
    this.password = pass;
    this.state = 0;
    this.stream = net.createConnection(this.port, this.host);
    this.stream.setEncoding('utf8');
    this.accdata = "";
    sys.puts(this.stream);
    
    var that = this;

    this.stream.addListener("connect", function() {
	    sys.puts("+ connected.");
        sys.puts(this.stream);
	    that.stream.write("<edf=\"on\"/>");
	});
	
	this.stream.addListener("data", function(data) {
//	    sys.puts("< ["+data+"]");
        s_data = that.accdata+""+data // weirdly, node on fabionudibranch returns data as a character array
        if (s_data.length > 0) {
		    j = that.parser.parse(s_data);
            if (j == 0) {
                sys.exit();
            }
	        if (j[0] == '{') { // parsing worked, let's get on with it
	            that.accdata = ""; // wipe the accumulation buffer
	        //    sys.puts("parsed ok, sending event with "+j.length+" bytes");
	            // sys.puts(j);
	            that.emit('parsed', j);
	        } else {
	            that.accdata = s_data; // save it for next time
	        }
        }
    });

	this.stream.addListener("close", function(data) {
	    sys.puts("- disconnected");
        if (that["close"] != undefined) {
            that["close"]();
        }
	});
	this.stream.addListener("end", function(data) {
	    sys.puts("- ended");
        if (that["close"] != undefined) {
            that["close"]();
        }
	});
};

exports.UAClient = UAClient;
