const express = require('express')
const routes = require('./routes')

const app = express()

app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;

        console.log(
            `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
        );
    });

    next();
});

app.use(routes);

module.exports = app