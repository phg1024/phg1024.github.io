/**
 * Created by peihongguo on 12/2/13.
 */

var siteinfo = {
    addr : {
        name: 'phg',
        at: '@',
        domain: 'tamu.edu'
    }
};

function writeEmailAddress() {
    var email = siteinfo.addr.name + siteinfo.addr.at + siteinfo.addr.domain;
    document.write("<a href='mailto:" + email + "'><em>" + email + "</em></a>");
}
