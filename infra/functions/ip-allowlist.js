var ALLOWED_IP = 'ALLOWED_IP_PLACEHOLDER';
var EXEMPT_PATHS = ['/sandbox.png', '/favicon.ico', '/ads.txt'];

var BLOCKED_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nakomis Sandbox</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#282c34;color:#ccc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center}img{max-width:420px;width:100%;border-radius:8px;margin-bottom:1.5rem}p{font-size:1.1rem;color:#aaa;margin-bottom:2rem}.links{font-size:.85rem;color:#585c64}.links a{color:#585c64;text-decoration:none;margin:0 .5rem}.links a:hover{color:#888}</style></head><body><img src="/sandbox.png" alt="Nakomis Sandbox"><p>Sorry, only cool kids are allowed to plan in the sandbox.</p><div class="links"><a href="https://nakom.is">nakom.is</a> &middot; <a href="https://blog.nakom.is">blog.nakom.is</a> &middot; <a href="https://github.com/nakomis/sandboxsite">source code</a></div></body></html>';

function handler(event) {
    var request = event.request;
    var clientIp = event.context.viewer.ip;

    for (var i = 0; i < EXEMPT_PATHS.length; i++) {
        if (request.uri === EXEMPT_PATHS[i]) {
            return request;
        }
    }

    if (clientIp !== ALLOWED_IP) {
        return {
            statusCode: 200,
            statusDescription: 'OK',
            headers: {
                'content-type': { value: 'text/html; charset=utf-8' },
            },
            body: BLOCKED_HTML,
        };
    }

    return request;
}
