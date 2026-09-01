const express = require('express');
const routes = express.Router();
const faker = require('faker');
faker.locale = 'pt_BR';

const connection = require('./connectionDb');

routes.get('/', (_, res) => {
    const sql = `INSERT INTO peoples(name) VALUES('${faker.name.findName()}')`;

    connection.query(sql, (err) => {
        if (err) {
            console.error('Erro ao inserir registro:', err);
            return res.status(500).send('Erro ao inserir registro');
        }

        connection.query("SELECT * FROM peoples", (err, results) => {
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