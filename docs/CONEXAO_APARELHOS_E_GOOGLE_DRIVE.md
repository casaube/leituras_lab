# Solo & Companhia
# Documento tecnico: conexao de aparelhos, interface de bancada e Google Drive

Data: 2026-06-20  
Escopo: middleware web de leitura de bancada para evolucao futura para LIMS completo.

## 1. Objetivo

Este documento especifica a estrategia de conexao entre os aparelhos de bancada e o computador que executa a interface do laboratorio Solo & Companhia. Tambem estrutura as proximas etapas para colocar a interface em operacao real, com sincronizacao para uma planilha online no Google Drive usando servicos oficiais do Google.

## 2. Premissas tecnicas

- A interface roda em navegador moderno, preferencialmente Google Chrome ou Microsoft Edge.
- A captura direta de dados sera feita inicialmente por Web Serial API, via porta USB/serial ou conversor RS-232 para USB.
- A aplicacao deve rodar em `localhost` ou HTTPS, pois a comunicacao serial pelo navegador exige contexto seguro.
- A saida de cada aparelho pode variar conforme firmware, configuracao regional, software controlador e acessorios instalados.
- A etapa de comissionamento deve registrar o formato bruto enviado por cada aparelho antes de validar o parser definitivo.
- Quando a comunicacao direta nao estiver disponivel, deve-se prever um adaptador alternativo por exportacao de arquivo CSV/TXT ou integracao com o software controlador do equipamento.

## 3. Arquitetura de conexao recomendada

```txt
Aparelho de bancada
  -> cabo RS-232 / USB / conversor USB-serial
  -> computador da bancada
  -> navegador Chrome/Edge com Web Serial
  -> modulo DeviceAdapter da interface
  -> parser por perfil de aparelho
  -> validacoes de bancada
  -> fila offline local
  -> Google Sheets / Google Drive
```

O principio arquitetural e tratar cada aparelho como um adaptador. A tela nao deve conhecer detalhes do protocolo serial; ela recebe apenas eventos normalizados:

```json
{
  "instrumentCode": "ANALYSER_FLAME_910M",
  "rawLine": "K 12.345",
  "parsedValue": 12.345,
  "receivedAt": "2026-06-20T18:30:00.000Z"
}
```

## 4. Requisitos do computador de bancada

- Windows 10/11 ou Linux homologado internamente.
- Chrome ou Edge atualizado.
- Portas USB suficientes para os equipamentos e conversores.
- Drivers do conversor USB-serial instalados quando necessario.
- Permissao do navegador para acessar a porta serial.
- Usuario sem acesso administrativo para rotina diaria, mas com perfil tecnico para instalacao/manutencao.
- Energia estabilizada ou nobreak para evitar perda de leitura em lote.

## 5. Padrao inicial de comunicacao serial

Valores iniciais conservadores para comissionamento:

| Parametro | Valor inicial |
|---|---|
| Baud rate | 9600 |
| Data bits | 8 |
| Paridade | Nenhuma |
| Stop bits | 1 |
| Flow control | Nenhum |
| Separador de linha | CR, LF ou CRLF |
| Parser inicial | Primeiro numero decimal encontrado na linha |

Esses valores devem ser confirmados no manual de cada aparelho ou no menu de comunicacao do equipamento. A interface ja permite alterar baud rate e regex do valor sem recompilar o programa.

## 6. Matriz de aparelhos

| Codigo no sistema | Aparelho | Tipo | Conexao preferencial | Configuracao inicial | Observacao de implantacao |
|---|---|---|---|---|---|
| `KASVI_K37_UVVIS0` | Kasvi K37-UVVIS0 | Espectrofotometro | USB/Serial | 9600, parser decimal generico | Validar se a saida ativa e por USB, RS-232 ou software de coleta. |
| `GBC_SAVANT_AA` | GBC SavantAA | Absorcao atomica | Software controlador ou serial | 9600, parser decimal generico | Em muitos cenarios o equipamento opera via computador/controlador; pode ser mais robusto capturar exportacao do software. |
| `FEMTO_600_PLUS` | Femto 600 Plus | Espectrofotometro | USB/Serial | 9600, parser decimal generico | Ativar modo de impressao/envio de leitura, quando disponivel. |
| `METASH_V5000_VISIBLE` | Metash V-5000 Visible | Espectrofotometro | USB/Serial | 9600, parser decimal generico | Validar delimitador de linha e formato do resultado. |
| `ANALYSER_FLAME_910M` | Fotometro de Chama 910 M - Analyser | Fotometro de chama | RS-232 ou USB virtual COM | 9600, parser decimal generico | Perfil adicionado ao programa. Confirmar no aparelho instalado baud, paridade, parametros de impressao e se a linha envia Na/K/Ca/Li com identificador do elemento. |

## 7. Procedimento de comissionamento por aparelho

1. Identificar a porta fisica do aparelho: USB, RS-232 DB9, porta de impressora ou software dedicado.
2. Conferir no menu do equipamento se existe opcao de envio automatico, impressao serial ou transferencia de dados.
3. Conectar o cabo ao computador.
4. Se for RS-232, usar conversor USB-serial confiavel e registrar o chipset/driver.
5. Abrir o Gerenciador de Dispositivos do Windows e anotar a porta `COM`.
6. Abrir a interface em `http://127.0.0.1:5174`.
7. Selecionar bancada e aparelho.
8. Ajustar baud rate.
9. Clicar em `Conectar` e autorizar a porta serial no navegador.
10. Fazer 5 leituras de teste com padrao conhecido.
11. Registrar as linhas brutas recebidas.
12. Ajustar a regex ate extrair exatamente o valor esperado.
13. Validar arredondamento, separador decimal, unidade e elemento quimico.
14. Salvar a configuracao aprovada do aparelho no perfil definitivo.

## 8. Regras para parser por aparelho

O parser atual captura o primeiro numero decimal da linha. Isso funciona para linhas simples, por exemplo:

```txt
ABS 1.234
K=45.6
RESULT: 0,987 mg/L
```

Casos que exigem parser especifico:

- Linha com mais de um numero: `K 12.3 Na 8.1`.
- Linha com numero de amostra e valor: `SAMPLE 15 VALUE 1.234`.
- Linha com status de erro: `OVER`, `HIGH`, `LOW`, `ERR`.
- Saida com unidade, data ou numero de metodo antes do valor.

Para o Fotometro de Chama 910 M - Analyser, a etapa de validacao deve confirmar se o aparelho envia apenas o valor atual ou se envia tambem o elemento lido. Se enviar elemento e valor, recomenda-se parser por elemento:

```txt
K 12.345
Na 8.901
Ca 45.100
```

Nesse caso, a regex pode evoluir para capturar o elemento e o valor, nao apenas o primeiro numero.

## 9. Controle de qualidade da conexao

Antes de liberar uso operacional:

- Comparar leitura exibida no aparelho com leitura capturada pela interface.
- Testar separador decimal `.` e `,`.
- Testar leitura normal, leitura acima da curva e leitura nula/erro.
- Desconectar cabo durante leitura para validar reconexao.
- Simular queda de internet e confirmar permanencia na fila offline.
- Testar troca de bancada sem misturar leituras entre lotes.
- Validar trilha de auditoria para leitura recebida, leitura salva, salto de sequencia e CQ.

## 10. Estrutura recomendada da planilha Google

Planilha: `Solo Companhia - Leituras de Bancada`

Abas recomendadas:

### `leituras`

| Coluna | Conteudo |
|---|---|
| `reading_id` | Identificador unico da leitura |
| `batch_id` | Lote |
| `bench_id` | Bancada |
| `bench_name` | Nome da bancada |
| `sample_position` | Posicao no rack |
| `analysis_code` | Analise |
| `instrument_code` | Aparelho |
| `raw_value` | Valor bruto |
| `dilution_factor` | Fator de diluicao |
| `corrected_value` | Valor final |
| `calibration_r2` | R2 da curva |
| `qc_status` | Status de CQ |
| `operator` | Tecnico/analista |
| `recorded_at` | Data/hora local |
| `synced_at` | Data/hora de sincronizacao |

### `auditoria`

| Coluna | Conteudo |
|---|---|
| `audit_id` | Identificador do evento |
| `event_type` | Tipo do evento |
| `aggregate_id` | ID da leitura/lote/bancada |
| `actor` | Usuario |
| `occurred_at` | Data/hora |
| `payload_json` | Dados do evento em JSON |

### `lotes`

| Coluna | Conteudo |
|---|---|
| `batch_id` | Lote |
| `analysis_code` | Analise |
| `started_at` | Inicio |
| `closed_at` | Fechamento |
| `status` | Aberto, bloqueado, finalizado |

### `cq`

| Coluna | Conteudo |
|---|---|
| `qc_id` | Identificador |
| `batch_id` | Lote |
| `kind` | Branco ou Controle |
| `expected_value` | Valor esperado |
| `measured_value` | Valor medido |
| `approved` | Sim/Nao |
| `recorded_at` | Data/hora |

## 11. Integracao com Google Sheets / Google Drive

Existem tres caminhos viaveis.

### Opcao A - Google Identity Services no navegador

Fluxo:

1. Criar projeto no Google Cloud.
2. Ativar Google Sheets API.
3. Criar OAuth Client ID do tipo Web.
4. Configurar origens autorizadas, por exemplo `http://127.0.0.1:5174` para teste e o dominio HTTPS final em producao.
5. Carregar a biblioteca Google Identity Services na interface.
6. Inicializar um token client com `client_id` e escopos.
7. Solicitar token em acao do usuario.
8. Usar o access token para chamar a Sheets API por REST.

Escopos minimos recomendados:

```txt
https://www.googleapis.com/auth/spreadsheets
```

Escopo alternativo quando a aplicacao tambem precisar criar/selecionar arquivos no Drive:

```txt
https://www.googleapis.com/auth/drive.file
```

Exemplo conceitual de append:

```js
await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/leituras!A:N:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [[readingId, batchId, benchId, position, rawValue, correctedValue]],
    }),
  },
);
```

Ponto de atencao: tokens de acesso expiram e precisam ser renovados por acao do usuario. Para uma bancada em modo kiosk, isso pode atrapalhar se a sessao expirar durante o turno.

### Opcao B - Backend proprio com Service Account

Fluxo:

1. Criar um pequeno backend interno ou cloud.
2. Armazenar credencial de Service Account no backend, nunca no navegador.
3. Compartilhar a planilha com o e-mail da Service Account.
4. A interface envia a fila offline para o backend.
5. O backend valida, audita e escreve no Google Sheets.

Esta e a opcao mais robusta para producao, porque:

- Nao expoe credenciais no navegador.
- Permite autenticar tecnico, bancada e computador.
- Permite retry, idempotencia, auditoria server-side e logs tecnicos.
- Facilita migracao futura para PostgreSQL/SQL Server sem reescrever a interface.

### Opcao C - Google Apps Script como endpoint

Fluxo:

1. Criar uma planilha Google.
2. Criar Apps Script vinculado ou standalone.
3. Implementar `doPost(e)`.
4. Publicar como Web App.
5. A interface envia leituras para a URL do Web App.
6. O Apps Script faz append na planilha.

O arquivo de referencia do Web App esta em:

```txt
docs/google-apps-script-webapp.js
```

Esta opcao e boa para MVP rapido, mas precisa cuidado com seguranca:

- Usar chave de integracao para MVP e migrar para backend/identidade corporativa quando houver dados sensiveis.
- Nao transmitir tokens OAuth do Apps Script para o cliente.
- Controlar permissoes e ownership do script.
- Avaliar quotas do Apps Script.

## 12. Proximas etapas de construcao

### Fase 1 - Validacao dos aparelhos

- Levantar manuais e cabos reais de cada equipamento.
- Registrar porta fisica e parametros de comunicacao.
- Capturar linhas brutas de 10 leituras por aparelho.
- Definir parser final por aparelho.
- Criar teste automatizado para cada parser.

### Fase 2 - Persistencia offline real

- Consolidar a fila offline em IndexedDB/Dexie ja implementada na interface.
- Manter tabela Dexie `syncQueue`.
- Manter tabela Dexie `auditEvents`.
- Implementar retry com backoff.
- Usar `reading_id` como chave idempotente para evitar duplicidade no Google Sheets.

### Fase 3 - Integracao Google

- Publicar o Apps Script como Web App.
- Configurar URL, chave de integracao e ID da planilha na interface.
- Criar planilha oficial e abas padronizadas.
- Adicionar tela de status de sincronizacao: pendentes, enviados, falhas e ultimo erro.
- Registrar resposta do Google na trilha de auditoria.

### Fase 4 - Operacao de bancada

- Criar cadastro de operadores.
- Criar abertura/fechamento de lote.
- Travar edicao de lote finalizado.
- Adicionar exportacao CSV/PDF de lote.
- Adicionar modo tela cheia para tablet/monitor de bancada.
- Adicionar configuracao persistente por computador/bancada.

### Fase 5 - Evolucao para LIMS completo

- `modules/sample-reception`: recepcao, etiquetas, cadeia de custodia.
- `modules/inventory`: reagentes, validade, consumo por metodo.
- `modules/billing`: faturamento e ordens de servico.
- `modules/reports`: emissao de laudos.
- `modules/audit`: auditoria BPL avancada.

## 13. Checklist de aceite para entrar em producao

- Todos os aparelhos testados com padrao conhecido.
- Erro maximo de captura definido e aprovado.
- Parser de cada aparelho versionado.
- Planilha Google protegida contra edicao manual indevida.
- Sincronizacao testada online/offline.
- Duplicidade bloqueada por `reading_id`.
- Auditoria imutavel habilitada.
- CQ obrigatorio validado a cada 20 amostras.
- Backup da planilha e politica de retencao definidos.
- Procedimento de contingencia documentado.

## 14. Referencias oficiais Google

- Google Sheets API `spreadsheets.values.append`: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append
- Google Sheets API para leitura/escrita de valores: https://developers.google.com/workspace/sheets/api/guides/values
- Google Identity Services - token model: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Google Apps Script Web Apps: https://developers.google.com/apps-script/guides/web
