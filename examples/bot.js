var sys = require('sys');
var uaclient = require('uaclient');

larabot = new uaclient.UAClient;
function announce_user_page(a) {
    larabot.flatten(a);
    sys.puts("= paged by "+a["fromname"]+"/"+a["fromid"]+", ``"+a["text"]+"''");
    larabot.page(a["fromid"], "thank you for paging larabot, have a nice day");
    sys.puts("check: "+a["fromname"]+" => "+a["fromid"]+" / "+sys.inspect(larabot.get_user(a["fromname"])));
}
larabot.addListener("announce_user_page", announce_user_page);
larabot.connect(process.argv[2], process.argv[3]);
