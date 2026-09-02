const express = require('express');
const routes = express.Router();
const faker = require('faker');
faker.locale = 'pt_BR';

const connection = require('./connectionDb');
const { register, dbQueryDurationSeconds } = require('./metrics');

routes.get('/health', (_, res) => {
    res.status(200).send('OK');
});

routes.get('/metrics', async (_, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
});

routes.get('/', (_, res) => {
    const name = faker.name.findName();
    const insertStart = Date.now();

    connection.query('INSERT INTO peoples(name) VALUES (?)', [name], (err) => {
        dbQueryDurationSeconds.observe(
            { operation: 'insert', status: err ? 'error' : 'success' },
            (Date.now() - insertStart) / 1000
        );

        if (err) {
            console.error('Erro ao inserir registro:', err);
            return res.status(500).send('Erro ao inserir registro');
        }

        const selectStart = Date.now();

        connection.query("SELECT * FROM peoples", (err, results) => {
            dbQueryDurationSeconds.observe(
                { operation: 'select', status: err ? 'error' : 'success' },
                (Date.now() - selectStart) / 1000
            );

            if (err) {
                console.error('Erro ao consultar registros:', err);
                return res.status(500).send('Erro ao consultar registros');
            }

            let html = '<h1>Desafio Devops!</h1>';

            results.forEach(element => {
                html += element.name + '<br>';
            });

            return res.send(html);
        });
    });
});

module.exports = routes;