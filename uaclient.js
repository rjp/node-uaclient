var net = require('net'),
    sys = require('sys'),
    events = require('events'),
    edf = require('edfparser');

function UAClient() {
    events.EventEmitter.call(this);
    var self = this;
    self.stream = undefined;
    self.state = undefined;
    self.parser = new edf.EDFParser();
    self.username = undefined;
    self.password = undefined;
	self.addListener("edf_on", function() {
	    this.stream.write("<request=\"user_login\"><name=\""+this.username+"\"/><password=\""+this.password+"\"/></>");
	    this.state = 1; // trying to login
	});
	self.addListener("reply_user_login", function(a) {
	    sys.puts("= logged in");
	});
	self.addListener("announce_user_page", function(a) {
	    // how to find the fromname bit?
	    sys.puts("= got a page");
	});
};
sys.inherits(UAClient, events.EventEmitter);

UAClient.prototype.safestring = function(s) {
    s.replace(/"/g, '\\"');
    return s;
}

UAClient.prototype.flatten = function(q) {
    for(i=0;i<q.children.length;i++){
        sys.puts("H "+q.children[i].tag+" = "+q.children[i].value);
        q[q.children[i].tag] = q.children[i].value};
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
	    sys.puts("< ["+data+"]");
        s_data = ""+data // weirdly, node on fabionudibranch returns data as a character array
	    j = that.parser.edfparse(s_data);
	    parsed = JSON.parse(j);
        for(i=0; i<parsed.parsed; i++) {
		    method = parsed.trees[i].tag + "_" + parsed.trees[i].value;
		    sys.puts("E "+method);
	        that.emit(method, parsed.trees[i]);
        }
	});
	
	this.stream.addListener("close", function(data) {
	    sys.puts("- disconnected");
	});
};

exports.UAClient = UAClient;
