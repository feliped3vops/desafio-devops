const express = require('express')
const routes = require('./routes')

const app = express()
const port = 3000

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

app.listen(port, () => {
    console.log('Rodando na porta ' + port)
})