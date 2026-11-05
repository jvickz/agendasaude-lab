# AgendaSaúde Lab

[Abrir a demonstração](https://jvickz.github.io/agendasaude-lab/) · [Experimentar a previsão de faltas](https://jvickz.github.io/agendasaude-lab/#previsao)

Demonstração interativa para uma equipe municipal de regulação experimentar estratégias de confirmação e aproveitamento de vagas. O laboratório compara a rotina de referência e oito combinações de lembrete digital, ligação e oferta a uma lista de espera.

**Abrir:** dê dois cliques em `index.html` ou use um servidor estático na pasta do projeto. A aplicação funciona no navegador, inclusive offline. Os dados da semana são fictícios.

## Uma experiência de dois minutos

1. Na **Semana típica**, observe os **140 atendimentos de referência**. Com lembretes e lista de espera, o mesmo conjunto de 200 horários registra 169 atendimentos. A diferença corresponde a 9 faltas evitadas e 20 vagas reocupadas.
2. Mantenha o orçamento de **45 minutos diários**, ligue a confirmação por telefone e simule. O total passa para 164. A equipe evitou mais faltas individuais, mas gastou minutos que antes serviam para chamar a fila.
3. Abra **Comparar as 8 estratégias**. A comparação usa o cenário e o tempo que aparecem nos controles. Escolher uma combinação aplica esses parâmetros ao painel. Em **Por dentro da semana**, selecione um dia e um serviço e consulte o percurso de uma vaga. O CSV sempre exporta os 200 horários da simulação aplicada, mesmo com filtros ativos. Some as colunas de ligações, ofertas e minutos usados para conferir os totais do painel.
4. Experimente **Menor alcance digital** ou **Transporte limitado**. Cada cenário tem sua própria referência. Em **Como funciona**, confira as hipóteses associadas a cada cenário.

## O que está sendo medido

Na seção **Dados municipais**, baixe o [exemplo de prefeitura fictícia](exemplo-prefeitura-ficticia.csv) e selecione o arquivo em **Importar CSV agregado**. O exemplo contém dois meses e quatro serviços. Para usar seus totais, mantenha as sete colunas e preencha uma linha por serviço e período. Use datas no formato AAAA-MM-DD e números inteiros não negativos. O arquivo é processado apenas no navegador e sai da memória ao recarregar a página.

Escolha o período e o serviço para comparar atendimentos, faltas sem aviso, cancelamentos antecipados e vagas reocupadas. Cada taxa usa o total de vagas agendadas do respectivo recorte. Cancelamentos incluem as vagas que outra pessoa chegou a ocupar. A comparação usa o mesmo serviço na semana simulada e acompanha a estratégia aplicada. Serviços fora dos quatro simulados exibem apenas o histórico. Com zero vagas, a taxa do histórico fica sem denominador.

São 40 horários por dia, durante cinco dias, para cardiologia, oftalmologia, ultrassonografia e radiografia. A semente fixa 431 mantém a população e a fila reproduzíveis. Uma ausência sem resposta preserva a reserva. A simulação oferece uma vaga a outra pessoa apenas após cancelamento explícito. Cada candidato da fila recebe no máximo uma oferta na semana. Regras de prioridade clínica, reagendamento e evolução da fila após a semana ficam fora deste recorte.

Todas as probabilidades operacionais são hipóteses escolhidas para a demonstração. Uma comparação local exigiria medir a rotina do município, inclusive a política já praticada e a disponibilidade real de equipe e fila. O [levantamento da Prefeitura de Passo Fundo](https://www.pmpf.rs.gov.br/2026/04/faltas-em-consultas-ultrapassam-25-e-ampliam-fila-de-espera-em-passo-fundo/) contextualiza o problema. A simulação usa exclusivamente registros gerados pelo próprio laboratório.

O gráfico mostra as quatro taxas lado a lado para a seleção atual. Use **Exportar comparação em CSV** para baixar uma linha por indicador, com período, serviço, configuração aplicada, volumes, percentuais e diferença em pontos percentuais (simulação menos histórico). Campos sem valor comparável ficam vazios no CSV.

## Verificação

### Voltar no tempo

Abra **Experimentar previsão de faltas** no início da página ou role até **Voltar no tempo**. Selecione semana e serviço, examine as previsões e clique em **Revelar resultado**. A troca de seleção oculta novamente o resultado. As previsões são pré-calculadas em Python e distribuídas em `previsoes.js`, permitindo abrir a demonstração offline.

O [histórico semanal fictício](historico-semanal-ficticio.csv) tem 104 semanas consecutivas, quatro serviços e 416 linhas, compatíveis também com a importação em **Dados municipais**. O gerador usa semente 431, diferenças por serviço, sazonalidade anual, tendência e sorteios de comparecimento.

Para reproduzir, instale as versões de `ml/requirements.txt` no seu ambiente Python e execute `python ml/prever.py --generate-example`. Para avaliar outro CSV semanal no mesmo formato, execute `python ml/prever.py --input caminho/do/historico.csv`. Isso atualiza `previsoes.js`. Recarregue a demonstração após gerar o arquivo. O nome do arquivo de origem aparece no painel. Cada serviço deve ter semanas consecutivas e ofertas positivas.

O modelo é uma regressão Ridge com padronização dos atributos no treino e alpha fixo em 10. Usa quatro taxas anteriores, seno e cosseno da época do ano, serviço e volume agendado da semana prevista. Os cancelamentos, reocupações e faltas da própria semana são usados apenas na avaliação do desfecho. O volume de agendamentos precisa ser conhecido quando a previsão é feita.

O gráfico **Faltas ao longo das semanas** exibe o serviço escolhido desde a primeira previsão avaliada até a semana selecionada. O modelo, a média de quatro semanas e as faltas observadas usam a mesma escala em número de faltas. **Exportar série em CSV** baixa exatamente esse período, com uma linha por semana, previsões, observações e erros absolutos. O observado e os erros da semana selecionada ficam vazios até clicar em **Revelar resultado**. Para exportar toda a série com os resultados, escolha a semana mais recente e revele o observado antes de baixar.

A tela exibe as quatro semanas que compõem a referência, incluindo vagas, faltas e taxas. Cada serviço precisa completar seu próprio período inicial de treino para aparecer no seletor. Ao revelar o observado, o painel compara os erros absolutos e sinaliza empate quando os valores exibidos coincidem na precisão de uma casa decimal.

Após quatro semanas para criar os atributos e 52 semanas iniciais de treino, a avaliação avança por 48 semanas. O modelo é refeito usando os períodos encerrados antes da semana-alvo. A referência é a média aritmética das quatro taxas anteriores multiplicada pelas vagas da semana-alvo. O erro absoluto médio é medido em faltas por serviço e semana. Há 192 avaliações no exemplo, sem seleção de hiperparâmetros a partir dos resultados.

Para conferir a separação temporal, execute `python -m unittest discover -s ml -p "test_*.py"`. O teste modifica o desfecho final e confere que nenhuma previsão anterior ou contemporânea foi alterada. Resultados em dados gerados demonstram o funcionamento do experimento. A avaliação com histórico municipal mediria a capacidade de previsão local.

O projeto usa **JavaScript** para gerar a semana, simular os contatos, comparar estratégias e exportar resultados. **HTML** estrutura as telas e os formulários. **CSS** define o visual e a adaptação ao tamanho da tela. As ilustrações e os ícones usam **SVG**, um formato vetorial. **Node.js** executa os testes de JavaScript.

Execute `node --test model.test.cjs dados-municipais.test.cjs` na pasta do projeto. Os testes cobrem os limites da equipe, a conservação dos horários, a liberação após cancelamento e a leitura e validação dos agregados. A fonte Inter está distribuída com a licença em `fonts/OFL.txt`.

