# Desafio Profissional - MVP de Simulação Industrial & Controladoria

Este projeto é um simulador estratégico desenhado para integrar as visões de **Engenharia Mecânica** e **Ciências Contábeis**. O objetivo central é fornecer ao fabricante uma ferramenta intuitiva para precificação, análise de custos e viabilidade econômica de produtos industriais complexos.

## 🎯 Proposta de Valor
O MVP (Minimum Viable Product) foca em preencher a lacuna entre o chão de fábrica (tempos e materiais) e a controladoria (impostos e margens). Ele permite que o gestor entenda como decisões técnicas — como a escolha de um material importado ou um processo de usinagem mais longo — impactam diretamente o lucro líquido final e o ponto de equilíbrio da sua operação.

## 📈 Pilares de Negócio

### 1. Engenharia de Produto & Estrutura (BOM)
*   **Detalhamento Técnico**: Permite a listagem completa de componentes, ligas metálicas e especificações industriais.
*   **Impacto da Origem**: Diferencia insumos **Nacionais** de **Importados**, simulando os custos adicionais de importação (II, AFRMM, Despacho) e a recuperação de créditos tributários no Lucro Real.
*   **Complexidade**: Aplica fatores de escala baseados na complexidade do projeto, refletindo o esforço real de P&D e manufatura.

### 2. Gestão de Custos Fabris (CPV)
*   **Mão de Obra Direta (MOD)**: Considera o custo-hora real acrescido de encargos sociais (INSS, FGTS, Férias, 13º, etc.), essencial para uma visão contábil conservadora e realista.
*   **Custos Indiretos (CIF)**: Simula o rateio de despesas fixas (depreciação de máquinas, energia, manutenção e seguros) pelo volume de produção mensal, utilizando o método de **Custeio por Absorção Total** conforme as normas contábeis (NBC TG 16).

### 3. Cenários Tributários & Vendas
*   **Regimes Fiscais**: Simula a diferença crucial entre **Lucro Real** (sistema não-cumulativo, com aproveitamento de créditos sobre insumos) e **Lucro Presumido** (sistema cumulativo).
*   **Destinos Estratégicos**: Avalia o impacto do ICMS em vendas internas, interestaduais e o benefício da imunidade/isenção em **Exportações ao Exterior**.
*   **Formação de Preço (Markup)**: Calcula o preço de venda sugerido para atingir a margem líquida desejada pelo acionista/investidor.

### 4. Inteligência em Controladoria
*   **Ponto de Equilíbrio (Break-even)**: Identifica o volume mínimo de unidades que devem ser vendidas no mês para que a operação não gere prejuízo (Lucro = 0).
*   **Demonstração do Resultado (DRE)**: Apresenta a cascata de faturamento, impostos sobre vendas, custos e despesas operacionais até chegar ao Lucro Líquido final.
*   **Análise de Viabilidade**: Classifica o projeto em níveis de risco (Viável, Atenção ou Inviável) com base em indicadores de margem bruta e líquida (ROS).

## 🚀 Evolução do Produto
O foco deste MVP é validar as regras de cálculo e a clareza das informações para os profissionais e estudantes das áreas envolvidas. Versões futuras podem englobar:
*   Inclusão de cenários para empresas do Simples Nacional.
*   Simulação de custos financeiros e taxas de juros (capital de giro).
*   Integração com tabelas de preços de commodities metálicas em tempo real.
*   Análise de Retorno sobre Investimento (ROI) e Payback de novos projetos.

---
*Este documento foca exclusivamente na lógica de negócio e estratégica do projeto Desafio Profissional.*
