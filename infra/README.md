# Bootstrap de infraestrutura: Vault + External Secrets Operator

Este diretório documenta a instalação **manual e única** do HashiCorp Vault e do External
Secrets Operator (ESO) no cluster. Diferente de tudo em `k8s/`, isso **não** é sincronizado
pelo ArgoCD: são componentes de infraestrutura do cluster, não parte do deploy da aplicação,
e só precisam ser instalados uma vez por cluster.

Depois desse bootstrap, os manifests em `k8s/vault-secretstore.yaml` e
`k8s/mysql-externalsecret.yaml` (esses sim, sincronizados via GitOps) fazem o ESO ler o
segredo do Vault e materializar o `Secret` `mysql-secret` no namespace `desafio-devops`.

## Limitação conhecida

O Vault abaixo é instalado em **modo dev**: armazenamento em memória, auto-unseal, token
root efêmero. É suficiente para demonstrar a arquitetura neste cluster de laboratório, mas
**não é apto para produção** — um reinício do pod do Vault apaga todos os segredos gravados
nele (seria necessário rodar o passo 3 de novo). Em produção, o Vault deveria rodar em modo
HA/raft com storage persistente e auto-unseal via um KMS (AWS KMS, GCP KMS, etc.).

## 1. Instalar o Helm CLI (se ainda não tiver)

```bash
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod +x get_helm.sh
USE_SUDO=false HELM_INSTALL_DIR="$HOME/.local/bin" ./get_helm.sh
```

## 2. Instalar o Vault (modo dev) e o External Secrets Operator

```bash
helm repo add hashicorp https://helm.releases.hashicorp.com
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

helm install vault hashicorp/vault -n vault --create-namespace \
  --set='server.dev.enabled=true' \
  --set='injector.enabled=false'

helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace
```

Aguarde os pods ficarem prontos:

```bash
kubectl wait --for=condition=Ready pod/vault-0 -n vault --timeout=120s
kubectl wait --for=condition=Available deployment --all -n external-secrets --timeout=180s
```

## 3. Gravar as credenciais do MySQL no Vault

O modo dev já vem com o secrets engine KV v2 habilitado em `secret/` (confirme com
`kubectl exec -n vault vault-0 -- vault secrets list`).

```bash
kubectl exec -n vault vault-0 -- vault kv put secret/desafio-devops/mysql \
  MYSQL_ROOT_PASSWORD="<senha forte gerada>" \
  MYSQL_USER="app_user" \
  MYSQL_PASSWORD="<senha forte gerada>" \
  MYSQL_DATABASE="node_db"
```

> Gere as senhas com algo como `openssl rand -base64 24`. Guarde-as só o tempo necessário
> para rodar os comandos — depois disso a fonte de verdade é o próprio Vault.

## 4. Habilitar e configurar o auth Kubernetes

O chart do Vault já cria a `ClusterRoleBinding` `vault-server-binding`
(`system:auth-delegator`) necessária para o Vault chamar a API `TokenReview`.

```bash
kubectl exec -n vault vault-0 -- vault auth enable kubernetes

kubectl exec -n vault vault-0 -- sh -c \
  'vault write auth/kubernetes/config kubernetes_host="https://$KUBERNETES_SERVICE_HOST:$KUBERNETES_SERVICE_PORT"'
```

## 5. Policy e role de acesso mínimo

```bash
kubectl exec -n vault vault-0 -- sh -c 'cat <<EOF | vault policy write desafio-devops-mysql-read -
path "secret/data/desafio-devops/mysql" {
  capabilities = ["read"]
}
EOF'

kubectl exec -n vault vault-0 -- vault write auth/kubernetes/role/desafio-devops-eso \
  bound_service_account_names=eso-vault-reader \
  bound_service_account_namespaces=desafio-devops \
  policies=desafio-devops-mysql-read \
  ttl=1h
```

A role só confia na ServiceAccount `eso-vault-reader` (criada em `k8s/mysql-serviceaccount.yaml`)
dentro do namespace `desafio-devops`, e só concede leitura desse único path no Vault — nada
além disso.

O ESO já vem com permissão (`ClusterRole external-secrets-controller`) para criar tokens de
qualquer ServiceAccount via `serviceaccounts/token`, necessária para o `serviceAccountRef`
usado no `SecretStore`.

## 6. Rotacionar o usuário/senha reais no MySQL

Gravar o segredo no Vault não altera, por si só, as credenciais já existentes num MySQL que
já foi inicializado (o `MYSQL_ROOT_PASSWORD`/`MYSQL_USER` só são aplicados pela imagem oficial
na primeira inicialização de um datadir vazio). Como o `mysql-0` já tinha dados, foi necessário
rodar manualmente, usando a senha `root` antiga:

```bash
kubectl exec -n desafio-devops mysql-0 -- env MYSQL_PWD=root mysql -uroot -e "
ALTER USER 'root'@'%' IDENTIFIED BY '<nova senha root>';
ALTER USER 'root'@'localhost' IDENTIFIED BY '<nova senha root>';
CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED WITH mysql_native_password BY '<nova senha do app_user>';
GRANT SELECT, INSERT, UPDATE, DELETE ON node_db.* TO 'app_user'@'%';
FLUSH PRIVILEGES;
"
```

> **Nota sobre o driver**: a aplicação usa o pacote `mysql` (legado) no Node, que não suporta
> o plugin de autenticação padrão do MySQL 8 (`caching_sha2_password`). Por isso o `app_user`
> precisa ser criado explicitamente com `IDENTIFIED WITH mysql_native_password`.

Em um cluster novo (sem dado legado), esse passo não seria necessário: bastaria definir
`MYSQL_ROOT_PASSWORD`/`MYSQL_USER`/`MYSQL_PASSWORD` no `mysql-statefulset.yaml` (como já está)
e a imagem oficial cuidaria da criação no primeiro boot — só que ainda assim seria necessário
ajustar o auth plugin do `app_user`, já que a criação automática também usa
`caching_sha2_password` por padrão no MySQL 8.
