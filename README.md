# Desafio Devops

O projeto contém uma aplicação básica com Node, Ngnix e MySQL. 

A cada atualização da página, um novo registro será cadastrado no banco de dados e será mostrado na listagem, na mesma página.  

O projeto contém algumas falhas e erros, analise e implemente as devidas correções.

Se não entender algum conceito ou parte do problema, não é motivo para se preocupar! Queremos que faça o desafio até onde souber.

### O que deve ser feito? 
 1. Correção e Estabilização:
       - Faça a aplicação funcionar corretamente utilizando Docker Compose.
2. Melhoria de Containers
      - Otimize os Dockerfiles existentes.
3. Kubernetes
      - Crie manifests para rodar essa aplicação em Kubernetes.
4. CI/CD
      - Implemente um pipeline automatizado. (Build, Teste e Deploy)
5. Observabilidade
      - Implemente visibilidade básica da aplicação.
6. Troubleshooting 
      - Documente no README, problemas encontrados, como você identificou e como resolveu, a arquitetura da solução com decisões técnicas e melhorias realizadas e por fim o que você faria com mais tempo.

Faça um fork e realize commits ao longo do processo para que possamos entender o seu modo de pensar! :)

---

## Documentação da Solução

### 1. Problemas encontrados e como foram resolvidos

O diagnóstico foi feito subindo o `docker-compose.yaml` original e observando os containers falharem (`docker compose up`, `docker logs`), o que expôs os problemas abaixo.

**Docker Compose**
- `nginx` usava uma imagem externa de terceiros (`javielrezende/nginx`) em vez de buildar a partir do `nginx/Dockerfile` do repositório — removida a referência para usar sempre a imagem construída localmente/no CI.
- Faltava a declaração da rede `node-network` usada pelos serviços — adicionada ao final do arquivo.
- Uso da chave `version` (obsoleta na especificação atual do Compose) — removida.
- Variável `DATABASE` não era passada para o serviço `app`, causando falha de conexão com o banco — adicionada em `environment`.

**Rede entre containers**
- O `nginx.conf` fazia `proxy_pass http://app;` sem a porta, então o proxy nunca alcançava a aplicação (que escuta em `3000`) — corrigido para `proxy_pass http://app:3000;`.

**Dockerfiles**
- `node/Dockerfile` usava `node:15` (fora de suporte) e copiava todo o código antes de instalar dependências, invalidando o cache do Docker a cada alteração de código — trocado para `node:22-bookworm-slim` e reordenado para `COPY package*.json` + `npm install` antes do `COPY . .`. Também foi limpo o cache do `apt` (`rm -rf /var/lib/apt/lists/*`) e ampliado o `.dockerignore` (`node_modules`, `.env`, `.git`, `npm-debug.log`) para reduzir o contexto de build e não vazar segredos locais para a imagem.
- `nginx/Dockerfile` usava a tag flutuante `nginx` (depois `nginx:alpine`) — fixada em `nginx:1.31.4-alpine` para builds reprodutíveis.
- `mysql/Dockerfile` copiava o diretório inteiro (`COPY . .`) para dentro de `docker-entrypoint-initdb.d`, o que rodaria qualquer arquivo do diretório como script de inicialização — corrigido para copiar apenas o `init.sql` necessário.

**Aplicação (Node)**
- As queries ao MySQL (`connection.query`) não tratavam erros nem callback de falha: uma query com erro travava a aplicação sem resposta ao cliente — adicionado tratamento de erro com log (`console.error`) e retorno de status `500` em caso de falha, tanto no `INSERT` quanto no `SELECT`.

### 2. Arquitetura da solução e decisões técnicas

**Local (Docker Compose)**
- Três serviços na mesma rede (`node-network`): `nginx` (porta `8080:80`, proxy reverso) → `app` (Node/Express, porta `3000`) → `db` (MySQL). O `app` usa `dockerize -wait tcp://db:3306` para só subir depois que o banco estiver aceitando conexões, evitando falhas de boot por corrida entre containers.
- A imagem do `app` em `docker-compose.yaml` referencia `felipetech1/desafio-devops-app:${APP_IMAGE_TAG:-latest}`, permitindo que o CI suba a mesma stack já usando a imagem recém-buildada (`APP_IMAGE_TAG=${{ github.sha }}`) como teste de integração antes de publicar.

**Kubernetes (`k8s/`)**
- Todos os recursos vivem no namespace `desafio-devops` (`namespace.yaml`), isolando o workload do restante do cluster.
- `app` é um `Deployment` (stateless) com `readinessProbe`/`livenessProbe` apontando para `/health` (endpoint dedicado, sem depender de round-trip com o banco) e `resources.requests/limits` definidos, para o scheduler alocar corretamente e evitar containers que consomem recursos sem limite.
- `mysql` é um `StatefulSet` (não `Deployment`), com `volumeClaimTemplates` para armazenamento persistente e identidade estável — decisão adequada por ser um banco de dados stateful. As credenciais ficam num `Secret` (`mysql-secret`) e o schema inicial num `ConfigMap` (`mysql-init-configmap.yaml`), montado em `/docker-entrypoint-initdb.d`.
- `nginx` é exposto tanto via `Service` `NodePort` (acesso direto/local, porta `30080`) quanto via `Ingress` (`ingressClassName: nginx`), cobrindo tanto um ambiente sem controlador de ingress quanto um cluster com um já instalado.
- Autoscaling horizontal (`app-hpa.yaml`): `HorizontalPodAutoscaler` de 1 a 5 réplicas por CPU (`averageUtilization: 70%`), com `stabilizationWindowSeconds: 60` no scale down — evita que o HPA remova réplicas de forma agressiva em picos de tráfego intermitentes.
- Deploy via GitOps (`argocd-application.yaml`): uma `Application` do ArgoCD aponta para o diretório `k8s/` deste repositório com `syncPolicy.automated` (`prune` + `selfHeal`), então qualquer manifest commitado no branch é aplicado automaticamente no cluster, sem `kubectl apply` manual.

**CI/CD (`.github/workflows/ci.yaml`)**
- Pipeline dispara em push para qualquer branch e em pull requests.
- Etapas: build da imagem da aplicação → sobe a stack completa via `docker compose up -d` usando a imagem recém-buildada → teste de fumaça (`curl --fail` no endpoint exposto pelo Nginx) → publica a imagem no Docker Hub, versionada pelo SHA do commit (`felipetech1/desafio-devops-app:${{ github.sha }}`).
- Versionar por SHA (em vez de `latest`) evita que um deploy em Kubernetes fique preso a uma tag mutável e permite rollback determinístico apontando o `Deployment` para um SHA anterior.

**Observabilidade**
- Middleware em `node/index.js` loga `method`, rota, status code e duração de cada requisição — visibilidade básica sobre tráfego e latência da aplicação, disponível via `stdout`/`kubectl logs`.

### 3. O que faria com mais tempo

- **Fechar o loop de CD**: hoje o CI publica a imagem no Docker Hub, mas o `app-deployment.yaml` ainda precisa ser atualizado manualmente com o novo SHA a cada release. Automatizaria isso com um job de CI que commita a nova tag no manifest (ou um ArgoCD Image Updater), completando o GitOps ponta a ponta.
- **Segredos**: a senha do MySQL está hardcoded como `root` em texto plano no `Secret` do Kubernetes e no `docker-compose.yaml`. Usaria um usuário de aplicação com privilégio mínimo (não `root`) e um cofre de segredos (SOPS, Sealed Secrets ou um secret manager externo) em vez de `stringData` versionado no Git.
- **Testes automatizados**: o `package.json` não tem suite de testes real (`"test": "echo ... && exit 1"`). Adicionaria testes unitários/integração para as rotas e faria o CI falhar de verdade em regressões, além de testes automatizados dos manifests Kubernetes (ex.: `kubeconform`/`kube-linter`).
- **Observabilidade além de log**: exportar métricas de aplicação (latência, taxa de erro, throughput) num formato Prometheus e adicionar tracing distribuído, hoje a visibilidade fica limitada a log estruturado em stdout.
- **Segurança da aplicação**: a query de `INSERT` em `routes.js` monta o SQL por interpolação de string; hoje o valor vem do `faker` (não é input externo), mas trocaria por *prepared statements* (`connection.query(sql, [valor])`) para eliminar o risco por padrão, especialmente se a aplicação vier a aceitar input de usuário.
- **Nginx**: adicionar `readinessProbe`/`resources` já cobre o básico; faria também hardening do `nginx.conf` (headers de segurança, rate limiting) e um HPA para o `nginx-deployment`, hoje fixo em 1 réplica.
- **Ambientes**: parametrizar os manifests (Kustomize/Helm) para suportar múltiplos ambientes (dev/staging/prod) em vez de um único conjunto estático em `k8s/`.
