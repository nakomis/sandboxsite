const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    app.use(
        '/sam',
        createProxyMiddleware({
            target: 'http://localhost:7861',
            changeOrigin: true,
            pathRewrite: { '^/sam': '' },
        })
    );
};
