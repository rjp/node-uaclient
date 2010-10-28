var net = require('net'),
    sys = require('sys'),
    events = require('events'),
    edf = require('edfparser');

user_byname = new Array();

function flatten(q, prefix) {
    for(var i=0;i<q.children.length;i++){
        if (prefix == undefined) {
            q[q.children[i].tag] = q.children[i].value
        } else {
            q[prefix + q.children[i].tag] = q.children[i].value
        }
    };
    return q;
}

function cache_user_list(tree) {
    var users = tree.children;
    sys.puts("caching user list, "+users.length+" exist");
    for(var i in users) {
        var user = users[i];
        if (user.tag == 'user') { // not all EDF children are useful
            var id = user.value;
            flatten(user);
//            sys.puts(user.name+" has ID "+id);
            user_byname[user.name] = user;
        }
    }
}

function reply_folder_list(a, that) {
//    <reply="folder_list"><folder=1><name="test"/><accessmode=7/><subtype=1/><unread=1/></><folder=2><name="private"/><accessmode=263/><subtype=1/></><folder=3><name="chat"/><accessmode=7/><subtype=1/><temp=1/></><numfolders=3/></>
    var f = [];
    for(var i in a.children) {
        var x = a.children[i];
        if (x.children != undefined) {
	        flatten(x);
	        if (x.subscribed != undefined) {
	            f.push(x.name);
	        }
        }
    }
    that.folders = f;
    that.emit('folders', f);
}

function req_user_list(self) {
    self.stream.write('<request="user_list"/>');
}

function req_folder_list(self) {
    self.request('folder_list', {searchtype: 0});
}

function UAClient() {
    events.EventEmitter.call(this);
    var self = this;
    self.stream = undefined;
    self.state = undefined;
    self.parser = new edf.EDFParser();
    self.username = undefined;
    self.password = undefined;
    self.shadow = undefined;

    // request a user_list when we login ...
    self.addListener("reply_user_login", function(){
        setTimeout(function(){ req_user_list(self); }, 4000); // avoid parsing troubles
        setTimeout(function(){ req_folder_list(self) }, 6000); // also
    });
    // ... then every 5 minutes after this
    setInterval(function(){req_user_list(self)}, 300000);
    setInterval(function(){req_folder_list(self)}, 302000);

    // try to login
	self.addListener("edf_on", function() {
        var h = { 
            name: this.username, password: this.password
        };
        if (this.shadow != undefined) {
            h.status = 256;
            h.shadow = 256;
        }
        sys.puts(this.hashtoedf(h));
        this.request('user_login', h);
	    this.state = 1; // trying to login
	});
    // cache the user list
    self.addListener("reply_user_list", cache_user_list);
    self.addListener("reply_folder_list", function(a){reply_folder_list(a,self)});

    var that = self;

	self.addListener("parsed", function(j) {
        // remove \r and escape \n
        var q1 = j.replace(/\r/g, ' ');
        j = q1.replace(/\n/g, '\\n');

	    parsed = JSON.parse(j);
        for(var i=0; i<parsed.parsed; i++) {
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
    for(var i=0;i<q.children.length;i++){
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
    for(var i in h) {
        if (parseInt(h[i]) === h[i]) { // a number
            edf = edf + "<"+i+"="+h[i]+"/>";
        } else {
            edf = edf + "<"+i+'="'+h[i]+'"/>';
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
    for(var i in edf.children) {
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
		    var j = that.parser.parse(s_data);
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
        process.exit(1);
	});
	this.stream.addListener("end", function(data) {
	    sys.puts("- ended");
        if (that["close"] != undefined) {
            that["close"]();
        }
        process.exit(2);
	});
};

exports.UAClient = UAClient;
