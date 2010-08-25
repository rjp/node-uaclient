var sys = require('sys');
var uaclient = require('uaclient');

function Bot() {
    uaclient.UAClient.call(this);
    var self = this;
}
sys.inherits(Bot, uaclient.UAClient);

larabot = new Bot;
Bot.prototype.announce_user_page = function(a) {
    sys.puts("= paged!");
}
larabot.connect(process.argv[2], process.argv[3]);
