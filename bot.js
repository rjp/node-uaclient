var sys = require('sys');
var uaclient = require('uaclient');

function Bot() {
    uaclient.UAClient.call(this);
    var self = this;
}
sys.inherits(Bot, uaclient.UAClient);

larabot = new Bot;
Bot.prototype.announce_user_page = function(a) {
    larabot.flatten(a);
    sys.puts("= paged by "+a["fromname"]+"/"+a["fromid"]+", ``"+a["text"]+"''");
    larabot.page(a["fromid"], "thank you for paging larabot, have a nice day");
}
larabot.connect(process.argv[2], process.argv[3]);
