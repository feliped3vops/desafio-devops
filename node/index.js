const express = require('express')
const routes = require('./routes')
const { httpRequestDurationSeconds, httpRequestsTotal } = require('./metrics')

const app = express()

app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const route = req.route ? req.route.path : req.path;

        console.log(
            `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
        );

        httpRequestDurationSeconds.observe(
            { method: req.method, route, status_code: res.statusCode },
            duration / 1000
        );
        httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
    });

    next();
});

app.use(routes);

module.exports = app