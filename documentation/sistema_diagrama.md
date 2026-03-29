# Documentação do Sistema - Diagrama de Casos de Uso

Este documento apresenta o diagrama de casos de Uso do **MVP de Simulação Industrial & Controladoria**, representando as principais interações do usuário (Ator) com as funcionalidades do sistema (Requisitos Funcionais).

```mermaid
graph LR
    %% Estilo dos Nós
    classDef actor fill:#f9f,stroke:#333,stroke-width:2px;
    classDef uc fill:#fff,stroke:#333,stroke-width:2px,rx:20,ry:20;

    %% Ator
    Actor((Gestor Industrial /<br/>Controlador))
    
    %% Fronteira do Sistema
    subgraph "MVP de Simulação Industrial & Controladoria"
        direction TB
        UC1([Definir Produto e Projeto])
        UC2([Gerenciar Estrutura de<br/>Materiais - BOM])
        UC3([Calcular Custos de<br/>Fabricação - MOD/CIF])
        UC4([Simular Cenários de<br/>Venda e Tributação])
        UC5([Analisar Viabilidade e DRE])
        UC6([Consultar Relatório Final])
    end
    
    %% Relacionamentos
    Actor --> UC1
    Actor --> UC2
    Actor --> UC3
    Actor --> UC4
    Actor --> UC5
    Actor --> UC6

    %% Descrições curtas dos requisitos (Dicas visuais)
    UC1 --- D1[Dimensões e Modelo]
    UC2 --- D2[Itens e Origem Nac/Imp]
    UC3 --- D3[Tempos e Rateio CIF]
    UC4 --- D5[Regimes Fiscais e Margens]
    UC5 --- D4[Indicadores e Lucratividade]
    
    style UC1 fill:#e1f5fe,stroke:#01579b
    style UC2 fill:#e1f5fe,stroke:#01579b
    style UC3 fill:#e1f5fe,stroke:#01579b
    style UC4 fill:#fff9c4,stroke:#fbc02d
    style UC5 fill:#c8e6c9,stroke:#2e7d32
    style UC6 fill:#c8e6c9,stroke:#2e7d32
```

## Requisitos Funcionais Mapeados

1.  **Definir Produto e Projeto**: Entrada de dados técnicos básicos (dimensões, peso estimado e nome do modelo).
2.  **Gerenciar Estrutura de Materiais (BOM)**: Listagem de insumos, diferenciando origem nacional e importada (impacto tributário).
3.  **Calcular Custos de Fabricação (MOD/CIF)**: Cálculo de Mão de Obra Direta com encargos e Custos Indiretos por absorção.
4.  **Simular Cenários de Venda e Tributação**: Configuração de markup, regime tributário (Lucro Real/Presumido) e destino.
5.  **Analisar Viabilidade e DRE**: Visualização da saúde financeira do projeto através da Demonstração do Resultado do Exercício.
6.  **Consultar Relatório Final**: Consolidação de todos os cálculos em uma visão de controladoria.
