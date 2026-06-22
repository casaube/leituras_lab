# Solo & Companhia - Interface de Leitura de Bancada

Middleware web para aquisicao de leituras laboratoriais de solos, com foco inicial em bancadas de espectrofotometria, fotometria de chama e absorcao atomica.

## Estado atual

Este repositorio agora esta estruturado como um app executavel na raiz:

```txt
.
  index.html
  server.mjs
  src/
    app.js
    data.js
    styles.css
  assets/
    solo-companhia-logo.svg
  docs/
    CONEXAO_APARELHOS_E_GOOGLE_DRIVE.md
    architecture/
```

## Como rodar

```bash
npm start
```

Depois acesse:

```txt
http://127.0.0.1:5174
```

Abrir por `localhost` e importante porque a Web Serial API exige contexto seguro.

## Validacao rapida

```bash
npm run check
```

## Funcionalidades atuais

- Multiplas bancadas independentes.
- Bandeja 30, Rack 50, Gradinha 90, Microplaca 96 e layout customizado.
- Conexao por Web Serial API em Chrome/Edge.
- Leitura manual e simulada para testes sem aparelho.
- Controle de R2, CQ, diluicao, estouro de escala e salto de sequencia.
- Fila offline real em IndexedDB com Dexie.
- Sincronizacao da fila com Google Sheets via Web App do Apps Script.
- Trilha de auditoria local.

## Aparelhos cadastrados

- Kasvi K37-UVVIS0
- GBC SavantAA
- Femto 600 Plus
- Metash V-5000 Visible
- Fotometro de Chama 910 M - Analyser

## Documentacao

- [Conexao de aparelhos e Google Drive](docs/CONEXAO_APARELHOS_E_GOOGLE_DRIVE.md)
- [Arquitetura planejada para evolucao LIMS](docs/architecture/README.md)

## Proximas etapas

- Criar retry com backoff para falhas temporarias de sincronizacao.
- Validar os parsers seriais com linhas reais dos aparelhos.
- Criar abertura/fechamento formal de lote.
- Adicionar autenticacao de operadores.

## Persistencia offline

A interface usa duas camadas locais:

- `localStorage`: apenas preferencias e estado visual da bancada.
- IndexedDB/Dexie: fila de sincronizacao e trilha de auditoria.

O modulo responsavel e [src/offline-db.js](src/offline-db.js). A fila antiga em `localStorage`, quando existir, e migrada automaticamente na primeira abertura.

## Google Sheets via Apps Script

A interface envia os registros pendentes para um Web App do Google Apps Script usando `POST` simples. Configure na tela:

- URL do Web App publicado.
- Chave de integracao.
- ID da planilha, quando o script nao estiver vinculado diretamente a ela.

Script de referencia para colar no Apps Script:

[docs/google-apps-script-webapp.js](docs/google-apps-script-webapp.js)

Nota: a chave de integracao configurada no navegador e uma protecao simples para MVP. Para producao com credenciais fortes, use um backend ou controle de identidade corporativo.
