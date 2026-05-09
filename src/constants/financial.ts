
export interface ChartAccount {
    id: string;
    code: string;
    name: string;
    type: 'receber' | 'pagar' | 'mixed';
    group: string;
}

export interface CostCenter {
    id: string;
    name: string;
}

export const UNIVERSAL_CHART_OF_ACCOUNTS: ChartAccount[] = [
    // 1 - RECEITAS OPERACIONAIS
    { id: 'gp_1', code: '1', name: 'RECEITAS OPERACIONAIS', type: 'receber', group: '1. RECEITAS' },
    { id: 'rev_serv', code: '1.1', name: 'Receita Bruta de Serviços', type: 'receber', group: '1. RECEITAS' },
    { id: 'rev_serv_bpo', code: '1.1.1', name: 'Mensalidades BPO', type: 'receber', group: '1. RECEITAS' },
    { id: 'rev_serv_cons', code: '1.1.2', name: 'Consultoria / Assessoria', type: 'receber', group: '1. RECEITAS' },
    { id: 'rev_serv_proj', code: '1.1.3', name: 'Projetos e Implantações', type: 'receber', group: '1. RECEITAS' },
    { id: 'rev_serv_out', code: '1.1.4', name: 'Outras Receitas de Serviços', type: 'receber', group: '1. RECEITAS' },
    
    { id: 'rev_vend', code: '1.2', name: 'Receita Bruta de Vendas', type: 'receber', group: '1. RECEITAS' },
    { id: 'rev_vend_merc', code: '1.2.1', name: 'Venda de Mercadorias', type: 'receber', group: '1. RECEITAS' },
    { id: 'rev_vend_prod', code: '1.2.2', name: 'Venda de Produtos', type: 'receber', group: '1. RECEITAS' },
    
    { id: 'rev_dev', code: '1.3', name: '(-) Devoluções e Abatimentos', type: 'receber', group: '1. RECEITAS' },
    { id: 'rev_simples', code: '1.4', name: '(-) Simples Nacional s/ Receita', type: 'receber', group: '1. RECEITAS' },

    // 2 - CUSTOS OPERACIONAIS
    { id: 'gp_2', code: '2', name: 'CUSTOS OPERACIONAIS', type: 'pagar', group: '2. CUSTOS' },
    { id: 'cost_cmv', code: '2.1', name: 'CMV — Custo das Mercadorias Vendidas', type: 'pagar', group: '2. CUSTOS' },
    { id: 'cost_cmv_comp', code: '2.1.1', name: 'Compras de Mercadorias para Revenda', type: 'pagar', group: '2. CUSTOS' },
    { id: 'cost_cmv_fret', code: '2.1.2', name: 'Fretes sobre Compras', type: 'pagar', group: '2. CUSTOS' },
    { id: 'cost_cmv_dev', code: '2.1.3', name: 'Devolução de Compras', type: 'pagar', group: '2. CUSTOS' },
    { id: 'cost_cmv_est', code: '2.1.4', name: 'Estoque Inicial / Final (ajuste)', type: 'pagar', group: '2. CUSTOS' },
    
    { id: 'cost_csp', code: '2.2', name: 'CSP — Custo dos Serviços Prestados', type: 'pagar', group: '2. CUSTOS' },
    { id: 'cost_csp_mao', code: '2.2.1', name: 'Mão de Obra Direta / Subcontratados', type: 'pagar', group: '2. CUSTOS' },
    { id: 'cost_csp_soft', code: '2.2.2', name: 'Licenças e Softwares Aplicados', type: 'pagar', group: '2. CUSTOS' },
    { id: 'cost_csp_mat', code: '2.2.3', name: 'Material de Consumo Direto', type: 'pagar', group: '2. CUSTOS' },
    
    { id: 'cost_fret_vend', code: '2.3', name: 'Frete sobre Vendas / Entrega', type: 'pagar', group: '2. CUSTOS' },
    { id: 'cost_out_dir', code: '2.4', name: 'Outros Custos Diretos', type: 'pagar', group: '2. CUSTOS' },

    // 3 - DESPESAS OPERACIONAIS
    { id: 'gp_3', code: '3', name: 'DESPESAS OPERACIONAIS', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess', code: '3.1', name: 'Pessoal e Encargos', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_sal', code: '3.1.1', name: 'Salários', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_pro', code: '3.1.2', name: 'Pró-labore', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_inss', code: '3.1.3', name: 'INSS Patronal', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_fgts', code: '3.1.4', name: 'FGTS', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_fer', code: '3.1.5', name: 'Férias', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_13', code: '3.1.6', name: '13º Salário', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_vt', code: '3.1.7', name: 'Vale Transporte (VT)', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_vr', code: '3.1.8', name: 'Vale Refeição (VR)', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_sau', code: '3.1.9', name: 'Plano de Saúde', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_seg', code: '3.1.10', name: 'Seguro de Vida', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_pess_out', code: '3.1.11', name: 'Outros Benefícios', type: 'pagar', group: '3. DESPESAS' },

    { id: 'exp_ocup', code: '3.2', name: 'Ocupação e Instalações', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_ocup_alug', code: '3.2.1', name: 'Aluguel', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_ocup_cond', code: '3.2.2', name: 'Condomínio', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_ocup_ener', code: '3.2.3', name: 'Energia Elétrica', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_ocup_agua', code: '3.2.4', name: 'Água', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_ocup_gas', code: '3.2.5', name: 'Gás', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_ocup_iptu', code: '3.2.6', name: 'IPTU', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_ocup_limp', code: '3.2.7', name: 'Limpeza e Conservação', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_ocup_man', code: '3.2.8', name: 'Manutenção Predial', type: 'pagar', group: '3. DESPESAS' },

    { id: 'exp_tec', code: '3.3', name: 'Comunicação e Tecnologia', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_tec_tel', code: '3.3.1', name: 'Telefone', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_tec_int', code: '3.3.2', name: 'Internet', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_tec_sys', code: '3.3.3', name: 'Sistemas / Assinaturas SaaS', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_tec_hosp', code: '3.3.4', name: 'Hospedagem / Cloud', type: 'pagar', group: '3. DESPESAS' },

    { id: 'exp_adm', code: '3.4', name: 'Despesas Administrativas', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_adm_mat', code: '3.4.1', name: 'Material de Escritório', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_adm_cont', code: '3.4.2', name: 'Contabilidade / BPO Financeiro', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_adm_jur', code: '3.4.3', name: 'Jurídico', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_adm_seg', code: '3.4.4', name: 'Seguros Gerais', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_adm_tax', code: '3.4.5', name: 'Taxas e Alvarás', type: 'pagar', group: '3. DESPESAS' },

    { id: 'exp_mkt', code: '3.5', name: 'Vendas e Marketing', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_mkt_comi', code: '3.5.1', name: 'Comissões de Vendas', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_mkt_publ', code: '3.5.2', name: 'Marketing / Publicidade / Anúncios', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_mkt_emb', code: '3.5.3', name: 'Embalagens', type: 'pagar', group: '3. DESPESAS' },
    { id: 'exp_mkt_viag', code: '3.5.4', name: 'Viagens e Representação', type: 'pagar', group: '3. DESPESAS' },

    { id: 'exp_out', code: '3.6', name: 'Outras Despesas Operacionais', type: 'pagar', group: '3. DESPESAS' },

    // 4 - RESULTADO FINANCEIRO
    { id: 'gp_4', code: '4', name: 'RESULTADO FINANCEIRO', type: 'mixed', group: '4. FINANCEIRO' },
    { id: 'exp_fin', code: '4.1', name: 'Despesas Financeiras', type: 'pagar', group: '4. FINANCEIRO' },
    { id: 'exp_fin_jur', code: '4.1.1', name: 'Juros / Multas Pagos', type: 'pagar', group: '4. FINANCEIRO' },
    { id: 'exp_fin_tar', code: '4.1.2', name: 'Tarifas Bancárias', type: 'pagar', group: '4. FINANCEIRO' },
    { id: 'exp_fin_iof', code: '4.1.3', name: 'IOF', type: 'pagar', group: '4. FINANCEIRO' },
    { id: 'exp_fin_desc', code: '4.1.4', name: 'Descontos Concedidos', type: 'pagar', group: '4. FINANCEIRO' },
    
    { id: 'rev_fin', code: '4.2', name: 'Receitas Financeiras', type: 'receber', group: '4. FINANCEIRO' },
    { id: 'rev_fin_jur', code: '4.2.1', name: 'Juros e Correções Recebidos', type: 'receber', group: '4. FINANCEIRO' },
    { id: 'rev_fin_desc', code: '4.2.2', name: 'Descontos Obtidos', type: 'receber', group: '4. FINANCEIRO' },
    { id: 'rev_fin_rend', code: '4.2.3', name: 'Rendimentos de Aplicações', type: 'receber', group: '4. FINANCEIRO' },

    // 5 - IMPOSTOS E TRIBUTOS
    { id: 'gp_5', code: '5', name: 'IMPOSTOS E TRIBUTOS', type: 'pagar', group: '5. IMPOSTOS' },
    { id: 'imp_simples', code: '5.1', name: 'Simples Nacional (DAS mensal)', type: 'pagar', group: '5. IMPOSTOS' },
    { id: 'imp_iss', code: '5.2', name: 'ISS — Serviços', type: 'pagar', group: '5. IMPOSTOS' },
    { id: 'imp_icms', code: '5.3', name: 'ICMS — Comércio', type: 'pagar', group: '5. IMPOSTOS' },
    { id: 'imp_pis_cof', code: '5.4', name: 'PIS / COFINS', type: 'pagar', group: '5. IMPOSTOS' },
    { id: 'imp_irpj_csll', code: '5.5', name: 'IRPJ / CSLL (se Lucro Presumido)', type: 'pagar', group: '5. IMPOSTOS' },
    { id: 'imp_out', code: '5.6', name: 'Outros Tributos', type: 'pagar', group: '5. IMPOSTOS' }
];

export const UNIVERSAL_COST_CENTERS: CostCenter[] = [
    { id: 'adm', name: 'Administrativo' },
    { id: 'fin', name: 'Financeiro' },
    { id: 'ops', name: 'Operacional / Produção' },
    { id: 'com', name: 'Comercial / Vendas' },
    { id: 'log', name: 'Logística' },
    { id: 'dir', name: 'Diretoria' }
];

export const UNIVERSAL_PAYMENT_METHODS = [
    { id: 'pix', name: 'PIX' },
    { id: 'card_credit', name: 'Cartão de Crédito' },
    { id: 'card_debit', name: 'Cartão de Débito' },
    { id: 'ticket', name: 'Boleto Bancário' },
    { id: 'transfer', name: 'Transferência / TED / DOC' },
    { id: 'cash', name: 'Dinheiro' }
];
