const request = require('supertest');

jest.mock('../connectionDb', () => ({
    query: jest.fn(),
}));

const connection = require('../connectionDb');
const app = require('../index');

beforeEach(() => {
    connection.query.mockReset();
});

describe('GET /health', () => {
    test('responde 200 OK', async () => {
        const response = await request(app).get('/health');

        expect(response.statusCode).toBe(200);
        expect(response.text).toBe('OK');
    });
});

describe('GET /metrics', () => {
    test('expoe metricas no formato do prometheus', async () => {
        const response = await request(app).get('/metrics');

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.text).toContain('http_request_duration_seconds');
        expect(response.text).toContain('db_query_duration_seconds');
    });
});

describe('GET /', () => {
    test('insere um registro e lista o conteudo em HTML', async () => {
        connection.query.mockImplementation((sql, paramsOrCallback, maybeCallback) => {
            if (sql.startsWith('INSERT')) {
                const callback = maybeCallback ?? paramsOrCallback;
                return callback(null, { insertId: 1 });
            }

            const callback = paramsOrCallback;
            return callback(null, [{ name: 'Fulano de Tal' }, { name: 'Ciclana Souza' }]);
        });

        const response = await request(app).get('/');

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.text).toContain('Desafio Devops!');
        expect(response.text).toContain('Fulano de Tal');
        expect(response.text).toContain('Ciclana Souza');
    });

    test('usa prepared statement no insert (protecao contra sql injection)', async () => {
        connection.query.mockImplementation((sql, paramsOrCallback, maybeCallback) => {
            const callback = maybeCallback ?? paramsOrCallback;
            callback(null, sql.startsWith('INSERT') ? { insertId: 1 } : []);
        });

        await request(app).get('/');

        const [insertSql, insertParams] = connection.query.mock.calls[0];

        expect(insertSql).toBe('INSERT INTO peoples(name) VALUES (?)');
        expect(Array.isArray(insertParams)).toBe(true);
    });

    test('responde 500 quando o insert falha', async () => {
        connection.query.mockImplementation((sql, paramsOrCallback, maybeCallback) => {
            const callback = maybeCallback ?? paramsOrCallback;
            callback(new Error('falha de conexao'));
        });

        const response = await request(app).get('/');

        expect(response.statusCode).toBe(500);
    });

    test('responde 500 quando o select falha', async () => {
        connection.query.mockImplementation((sql, paramsOrCallback, maybeCallback) => {
            if (sql.startsWith('INSERT')) {
                const callback = maybeCallback ?? paramsOrCallback;
                return callback(null, { insertId: 1 });
            }

            const callback = paramsOrCallback;
            return callback(new Error('falha de conexao'));
        });

        const response = await request(app).get('/');

        expect(response.statusCode).toBe(500);
    });
});
