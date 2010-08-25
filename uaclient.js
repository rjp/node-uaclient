var net = require('net'),
    sys = require('sys'),
    edf = require('edfparser');

function UAClient() {
    this.stream = undefined;
    this.state = undefined;
    this.parser = new edf.EDFParser();
};

UAClient.prototype.edf_on = function() {
    this.stream.write("<request=\"user_login\"><name=\"bot\"/><password=\"moo\"/></>");
    this.state = 1; // trying to login
};

UAClient.prototype.reply_user_login = function(a) {
    sys.puts("= logged in");
};

UAClient.prototype.announce_user_page = function(a) {
    // how to find the fromname bit?
    sys.puts("= got a page");
}

UAClient.prototype.connect = function() {
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
	});
};

exports.UAClient = UAClient;
