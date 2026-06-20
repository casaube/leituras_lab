# Solo & Companhia - Interface interativa de bancada

App estatico para testar a operacao de bancada do middleware LIMS.

## Como abrir

O servidor local ja foi iniciado em:

```txt
http://127.0.0.1:5174
```

Abrir por `localhost` e importante porque a Web Serial API do navegador exige contexto seguro.

## Conexao com aparelhos

A tela usa `navigator.serial`, disponivel em Chrome/Edge. O fluxo previsto e:

1. Conectar o aparelho ao computador via USB/serial ou conversor RS-232.
2. Selecionar o perfil do aparelho na bancada.
3. Ajustar baud rate e regex de captura, se necessario.
4. Clicar em `Conectar`.
5. Quando o aparelho enviar uma linha contendo um numero, o sistema captura o primeiro valor decimal e envia para a amostra atual.

Perfis cadastrados:

- Kasvi K37-UVVIS0
- GBC SavantAA
- Femto 600 Plus
- Metash V-5000 Visible
- Fotometro de Chama 910 M - Analyser

Como cada laboratorio pode configurar saida serial diferente no proprio equipamento, o campo `Regex valor` permite adaptar o parser sem recompilar a interface.

Documento tecnico completo:

```txt
DOCUMENTO_CONEXAO_APARELHOS_E_GOOGLE_DRIVE.md
```

## Bancadas e racks

A interface suporta multiplas bancadas independentes. Modelos iniciais:

- Bandeja 30: 3 fileiras x 10 posicoes
- Rack 50: 5 fileiras x 10 posicoes
- Gradinha 90: 6 fileiras x 15 posicoes
- Microplaca 96: 8 fileiras x 12 posicoes
- Layout customizado, alterando fileiras e posicoes por fileira

Cada bancada mantem seu lote, aparelho, metodo, calibracao, posicao atual, fila offline e trilha de auditoria.

## Observacao sobre Google Drive

O botao `Sincronizar` marca a fila local como sincronizada para demonstrar o fluxo offline-first. Para producao, ele deve chamar o reposititorio real da Google Sheets API ou um endpoint backend/Apps Script com OAuth.
