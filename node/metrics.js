const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDurationSeconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duracao das requisicoes HTTP em segundos',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total de requisicoes HTTP recebidas',
    labelNames: ['method', 'route', 'status_code'],
});

const dbQueryDurationSeconds = new client.Histogram({
    name: 'db_query_duration_seconds',
    help: 'Duracao das queries ao MySQL em segundos',
    labelNames: ['operation', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2],
});

register.registerMetric(httpRequestDurationSeconds);
register.registerMetric(httpRequestsTotal);
register.registerMetric(dbQueryDurationSeconds);

module.exports = {
    register,
    httpRequestDurationSeconds,
    httpRequestsTotal,
    dbQueryDurationSeconds,
};
