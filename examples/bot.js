var sys = require('sys');
var uaclient = require('uaclient');

larabot = new uaclient.UAClient;
function announce_user_page(a) {
    larabot.flatten(a);
    sys.puts("= paged by "+a["fromname"]+"/"+a["fromid"]+", ``"+a["text"]+"''");
    larabot.page(a["fromid"], "thank you for paging larabot, have a nice day");
    sys.puts("check: "+a["fromname"]+" => "+a["fromid"]+" / "+sys.inspect(larabot.get_user(a["fromname"])));
}
larabot.shadow = 256;
larabot.caching = false;
larabot.addListener("announce_user_page", announce_user_page);
larabot.addListener("uaclient_login", function(){sys.puts("active session");});
larabot.connect(process.argv[2], process.argv[3], process.argv[4], process.argv[5]);
