var net = require('net'),
    sys = require('sys'),
    edf = require('edfparser');

function UAClient() {
    this.stream = undefined;
    this.state = undefined;
    this.parser = new edf.EDFParser();
    this.username = undefined;
    this.password = undefined;
};

UAClient.prototype.safestring = function(s) {
    s.replace(/"/g, '\\"');
    return s;
}

UAClient.prototype.flatten = function(q) {
    for(i=0;i<q.children.length;i++){
        sys.puts("H "+q.children[i].tag+" = "+q.children[i].value);
        q[q.children[i].tag] = q.children[i].value};
}

UAClient.prototype.edf_on = function() {
    this.stream.write("<request=\"user_login\"><name=\""+this.username+"\"/><password=\""+this.password+"\"/></>");
    this.state = 1; // trying to login
};

UAClient.prototype.reply_user_login = function(a) {
    sys.puts("= logged in");
};

UAClient.prototype.announce_user_page = function(a) {
    // how to find the fromname bit?
    sys.puts("= got a page");
}

UAClient.prototype.page = function(to, text) {
    edf = "<request=\"user_contact\"><toid="+to+"/><text=\""+this.safestring(text)+"\"/></>";
    sys.puts("> "+edf);
    this.stream.write(edf);
}

UAClient.prototype.connect = function(user, pass) {
    this.username = user;
    this.password = pass;
    this.state = 0;
    this.stream = net.createConnection(2020, 'ua2.org');
    sys.puts(this.stream);
    
    var that = this;

    this.stream.addListener("connect", function() {
	    sys.puts("+ connected.");
        sys.puts(this.stream);
	    that.stream.write("<edf=\"on\"/>");
	});
	
	this.stream.addListener("data", function(data) {
	    sys.puts("< "+data);
	    j = that.parser.parse(data);
	    parsed = eval("("+j+")");
	    method = parsed.tag + "_" + parsed.value;
	    sys.puts("E "+method);
	
	    if (that[method] != undefined) {
            sys.puts("! "+method);
            that[method](parsed);
        };
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
