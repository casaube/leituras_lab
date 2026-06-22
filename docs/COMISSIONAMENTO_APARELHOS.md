# Comissionamento de aparelhos

Este documento orienta a validacao real dos equipamentos conectados a interface.

## O que ja esta implementado

- Captura de linhas seriais reais no painel `Conexao do aparelho`.
- Registro de linha bruta, valor parseado, aparelho, baud rate, regex e horario.
- Limite local das 25 linhas mais recentes para evitar crescimento excessivo do armazenamento.
- Ajuste de `Regex valor` pela interface.

## O que falta para concluir o comissionamento real

E necessario conectar cada aparelho fisico e coletar linhas reais. Sem essas linhas, nao e possivel homologar o parser final de cada modelo.

Para cada aparelho, coletar pelo menos:

- 5 leituras normais.
- 2 leituras abaixo/proximas do branco.
- 2 leituras altas/proximas do limite da curva.
- 1 linha de erro ou status, se o aparelho enviar.
- Foto ou anotacao do valor exibido na tela do equipamento para comparar com o valor capturado.

## Procedimento

1. Abrir `http://127.0.0.1:5174`.
2. Selecionar a bancada correta.
3. Selecionar o aparelho.
4. Conferir baud rate.
5. Clicar em `Conectar`.
6. Clicar em `Capturar` no bloco `Comissionamento serial`.
7. Disparar leituras reais no aparelho.
8. Conferir se `Valor` corresponde ao display do equipamento.
9. Ajustar `Regex valor` quando necessario.
10. Repetir ate capturar leituras consistentes.

## Aparelhos a validar

- Kasvi K37-UVVIS0
- GBC SavantAA
- Femto 600 Plus
- Metash V-5000 Visible
- Fotometro de Chama 910 M - Analyser

## Criterio de aceite

- Linha bruta registrada.
- Valor parseado igual ao valor exibido no equipamento, respeitando casas decimais.
- Parser aprovado para leituras normais e mensagens de erro.
- Baud rate e porta fisica documentados.
- Tecnico responsavel registra data/hora do teste.

