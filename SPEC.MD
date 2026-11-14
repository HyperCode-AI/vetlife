Specification (spec.md) — Plataforma VetLife

1\. Quem Usa (Atores)

Administrador (Admin): Gestor ou dono do laboratório. Possui acesso total ao painel administrativo. Pode cadastrar exames, configurar parâmetros globais, gerenciar usuários, controlar tabelas de preços com vigência e visualizar o painel financeiro.



Biomédico / Técnico: Operador da rotina do laboratório. Acessa o painel para cadastrar pacientes/atendimentos, preencher os campos dinâmicos de lançamento de cada exame, configurar laudos, anexar exames complementares (ex: ultrassom ou PDFs) e liberar/enviar laudos.



Médico Veterinário: Parceiro externo. Possui um portal de login exclusivo (via e-mail/CRM) para consultar o histórico de exames solicitados e baixar os laudos em PDF.



Tutor (Cliente): Dono do animal. Acessa uma página pública dedicada informando apenas o código de protocolo (sem necessidade de cadastro ou senha) para visualizar e baixar o laudo do seu pet.



2\. O que Cada Um Faz (Histórias de Usuário)

Administrador

HU-01: Como Admin, quero cadastrar e configurar os exames realizados pelo laboratório (código, nome, seção técnica, prazo, tipo de tubo, quantidade de etiquetas) para manter o catálogo atualizado.



HU-02: Como Admin, quero configurar campos de entrada específicos para o lançamento de cada exame, permitindo que laudos diferentes tenham inputs personalizados (ex: contagem de ovos, culturas bacterianas, parâmetros bioquímicos).



HU-03: Como Admin, quero gerenciar tabelas de preços com vigência (datas de início e fim) para aplicar reajustes e vincular preços diferenciados por convênio ou clínica parceira.



HU-04: Como Admin, quero configurar os valores de referência dos exames cruzando espécie, sexo e faixa etária inicial/final (em dias/meses).



HU-05: Como Admin, quero configurar os modelos de laudos (cabeçalho, rodapé e estrutura padrão) utilizando editor de texto livre e tags dinâmicas.



Biomédico / Técnico

HU-06: Como Biomédico, quero cadastrar um novo atendimento/paciente informando dados do tutor, animal, espécie, raça, idade e médico veterinário solicitante.



HU-07: Como Biomédico, quero preencher os campos de lançamento específicos configurados para cada exame ao registrar os resultados da rotina laboratorial.



HU-08: Como Biomédico, quero anexar arquivos complementares (como imagens de ultrassom ou PDFs) ao laudo do paciente.



HU-09: Como Biomédico, quero finalizar e disponibilizar o laudo para consulta, permitindo o download em PDF e envio direto.



Médico Veterinário

HU-10: Como Veterinário, quero fazer login no portal dedicado (via e-mail/CRM) para acompanhar todos os exames que solicitei.



HU-11: Como Veterinário, quero baixar o PDF dos laudos dos meus pacientes de forma rápida.



Tutor (Cliente)

HU-12: Como Tutor, quero acessar a página pública e digitar o código de protocolo para visualizar e baixar o laudo do meu animal sem precisar de senha.



3\. Telas do Sistema

Landing Page Pública (vetlifelab.com.br):



Apresentação institucional do laboratório VetLife.



Acesso rápido ao "Portal do Veterinário" (Login por e-mail/CRM) e à "Consulta de Resultados" (Busca por código de protocolo para tutores).



Seção de solicitação de coleta (endereço, dados de contato e observações).



Portal do Veterinário:



Tela de login por e-mail/CRM.



Listagem de exames solicitados, status e botão de download do laudo em PDF.



Portal do Tutor (Consulta por Protocolo):



Campo único de busca por código de protocolo e visualização do laudo em PDF.



Painel Interno (Admin / Biomédico):



Dashboard Operacional: Visão geral de exames do dia, pendentes e concluídos.



Atendimentos / Rotina: Tela para cadastrar pacientes, tutores, vincular veterinário, selecionar exames e gerar etiquetas de coleta.



Lançamento de Laudos: Editor dinâmico adaptado com os campos de entrada específicos configurados para cada exame, cruzamento de valores de referência por idade/espécie e anexos.



Configurações (Exclusivo Admin):



Cadastro de exames, seções técnicas, tubos e prazos.



Configuração dos campos de lançamento por exame.



Gestão de Tabelas de Preços com Vigência (períodos de reajuste).



Editor de modelos de laudos e gerenciamento de valores de referência por faixa etária/espécie/sexo.



Dashboard Financeiro (Exclusivo Admin): Indicadores e balancete simples.



4\. Dados (Estrutura do Banco de Dados)

Tabela users: id, name, email, password\_hash, role (admin, biomedical).



Tabela exams: id, code, name, section, delivery\_days, tube\_type, label\_qty, reference\_template\_id.



Tabela exam\_input\_fields: id, exam\_id, field\_name, field\_type (text, number, select), options (JSON para selects), is\_required. (Define os campos de entrada customizados por exame).



Tabela price\_tables: id, name, start\_date, end\_date, is\_active. (Gerencia as vigências e reajustes de preços).



Tabela exam\_prices: id, price\_table\_id, exam\_id, price. (Vincula o preço de cada exame à respectiva tabela de vigência).



Tabela exam\_references: id, exam\_id, species, gender, min\_age\_days, max\_age\_days, reference\_text\_content.



Tabela patients: id, name, species, breed, gender, birth\_date, tutor\_name, tutor\_phone, tutor\_email.



Tabela vets: id, name, crmv, clinic\_name, email, phone.



Tabela orders: id, protocol\_code, patient\_id, vet\_id, status (pendente, em\_analise, concluido), created\_at.



Tabela exam\_results: id, order\_id, exam\_id, dynamic\_content (JSON com os dados preenchidos nos campos específicos de cada exame), pdf\_url, released\_at.



5\. Regras de Negócio

RN-01: O acesso à tela de configurações (cadastro de exames, configuração de campos de entrada, tabelas de preços com vigência e modelos de laudos) é restrito exclusivamente ao perfil admin.



RN-02: O tutor não realiza cadastro ou senha; a autenticação para visualização do laudo é feita estritamente via protocol\_code.



RN-03: Durante o lançamento de um exame pelo biomédico, o sistema deve renderizar dinamicamente os campos de entrada específicos configurados previamente para aquele determinado exame.



RN-04: O cálculo do valor do exame em um atendimento deve respeitar a tabela de preços ativa com base na data da solicitação (vigência).



RN-05: O domínio oficial da plataforma é vetlifelab.com.br, registrado e gerenciado via Registro.br.



6\. Critérios de Pronto (Definition of Done)

\[ ] O site institucional (vetlifelab.com.br) está no ar? (Sim/Não)



\[ ] A landing page possui o campo de consulta de laudos por código de protocolo para tutores? (Sim/Não)



\[ ] O portal do veterinário permite login por e-mail/CRM e listagem de seus exames? (Sim/Não)



\[ ] O painel interno diferencia corretamente os acessos de Admin e Biomédico? (Sim/Não)



\[ ] É possível configurar campos de entrada diferentes para cada exame no painel de administração? (Sim/Não)



\[ ] O sistema gerencia tabelas de preços com controle de vigência e reajustes? (Sim/Not)



\[ ] O sistema gera o laudo formatado e permite exportação/download em PDF? (Sim/Não)



O que FICA FORA da Versão 1 (Excluído do Escopo):

Integração com gateway de pagamentos de terceiros (checkout/links de pagamento automáticos — fica para fases futuras mediante novo orçamento).



Aplicativo mobile nativo (o sistema será 100% responsivo via navegador web).



Emissão automatizada de Notas Fiscais pelo sistema (faturamento e NFs continuam nos softwares externos que o laboratório já utiliza).

